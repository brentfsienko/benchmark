"use client";

import dynamic from "next/dynamic";
import {
  FormEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { createBench, deleteBench, getBench, getProfile, listBenchPins, listBenchReviews, listWishlist, searchBenches, updateBenchLocation } from "@/src/lib/api";
import type { Bench, BenchPin, BenchReview } from "@/src/lib/types";
import { BenchmarkLogo } from "@/src/components/benchmark-logo";
import { BenchExploreSheet } from "@/src/components/bench-explore-sheet";
import { Toast } from "@/src/components/toast";
import type { ViewportBounds } from "@/src/components/explore-map";
import {
  NEARBY_ZOOM,
  readSavedMapView,
  viewportAround,
  type SavedMapView
} from "@/src/lib/map-view";
import { trackEvent } from "@/src/lib/analytics";
import { useAuth } from "@/src/contexts/auth-context";
import { isOnboardingComplete } from "@/src/lib/onboarding";
import { BENCH_FACET_TAG_LABELS, BENCH_TYPE_LABELS } from "@/src/lib/bench-type";
import { useRouter } from "next/navigation";

const ADD_FORM_PEEK_VH = 58;
const ADD_FORM_EXPANDED_VH = 88;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

const ExploreMap = dynamic(
  () => import("@/src/components/explore-map").then((m) => m.ExploreMap),
  {
    ssr: false,
    loading: () => (
      <div style={{ height: "100%", display: "grid", placeItems: "center" }}>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>loading map…</p>
      </div>
    )
  }
);

const CAROUSEL_CARD_WIDTH = 168;
const CAROUSEL_GAP = 10;
/** Fraction of the map viewport (centered) used for the preview carousel. */
const CAROUSEL_FOCUS_FRACTION = 0.36;
/** Soft cap so a world pan session can't grow unbounded in memory. */
const PIN_CACHE_MAX = 2500;

function lngInBounds(lng: number, swLng: number, neLng: number): boolean {
  // Antimeridian: sw is east of ne (e.g. 170 → -170).
  if (swLng > neLng) return lng >= swLng || lng <= neLng;
  return lng >= swLng && lng <= neLng;
}

function pinInBounds(b: BenchPin, bounds: ViewportBounds): boolean {
  return (
    b.latitude >= bounds.sw_lat &&
    b.latitude <= bounds.ne_lat &&
    lngInBounds(b.longitude, bounds.sw_lng, bounds.ne_lng)
  );
}

/** Expand viewport slightly so cache keeps pins just off-screen while panning. */
function padBounds(bounds: ViewportBounds, factor = 0.35): ViewportBounds {
  const latSpan = Math.max(bounds.ne_lat - bounds.sw_lat, 0.0001);
  const crosses = bounds.sw_lng > bounds.ne_lng;
  const lngSpan = crosses
    ? Math.max(180 - bounds.sw_lng + (bounds.ne_lng + 180), 0.0001)
    : Math.max(bounds.ne_lng - bounds.sw_lng, 0.0001);
  const latPad = latSpan * factor;
  const lngPad = lngSpan * factor;
  let sw_lng = bounds.sw_lng - lngPad;
  let ne_lng = bounds.ne_lng + lngPad;
  if (!crosses) {
    if (sw_lng < -180) sw_lng += 360;
    if (ne_lng > 180) ne_lng -= 360;
  }
  return {
    sw_lat: Math.max(-90, bounds.sw_lat - latPad),
    ne_lat: Math.min(90, bounds.ne_lat + latPad),
    sw_lng,
    ne_lng,
    zoom: bounds.zoom
  };
}

function evictPinCache(cache: Map<string, BenchPin>, keepNear: ViewportBounds | null) {
  if (!keepNear) {
    if (cache.size > PIN_CACHE_MAX) cache.clear();
    return;
  }
  const padded = padBounds(keepNear, 0.75);
  for (const [id, pin] of cache) {
    if (!pinInBounds(pin, padded)) cache.delete(id);
  }
  if (cache.size <= PIN_CACHE_MAX) return;
  // Drop oldest insertion order until under cap.
  const overflow = cache.size - PIN_CACHE_MAX;
  let i = 0;
  for (const id of cache.keys()) {
    if (i++ >= overflow) break;
    cache.delete(id);
  }
}

/** Shrink viewport bounds to a centered focus rect for the carousel. */
function centerFocusBounds(bounds: ViewportBounds, fraction = CAROUSEL_FOCUS_FRACTION): ViewportBounds {
  const latSpan = bounds.ne_lat - bounds.sw_lat;
  const lngSpan = bounds.ne_lng - bounds.sw_lng;
  const latPad = (latSpan * (1 - fraction)) / 2;
  const lngPad = (lngSpan * (1 - fraction)) / 2;
  // Bias slightly north — the carousel chrome covers the bottom of the map.
  const northBias = latSpan * 0.06;
  return {
    sw_lat: bounds.sw_lat + latPad + northBias,
    ne_lat: bounds.ne_lat - latPad + northBias,
    sw_lng: bounds.sw_lng + lngPad,
    ne_lng: bounds.ne_lng - lngPad,
    zoom: bounds.zoom
  };
}

const PlusIcon = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
    <line x1={12} y1={5} x2={12} y2={19} />
    <line x1={5} y1={12} x2={19} y2={12} />
  </svg>
);

const CheckIcon = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const TrashIcon = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1={10} y1={11} x2={10} y2={17} />
    <line x1={14} y1={11} x2={14} y2={17} />
  </svg>
);

const MoveIcon = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v20M2 12h20" />
    <path d="m8 6 4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4M18 8l4 4-4 4" />
  </svg>
);

const LocateIcon = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx={12} cy={12} r={3} />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    <circle cx={12} cy={12} r={7} />
  </svg>
);

type ExploreFilters = {
  minRating?: number;
  types?: string[];
  tags?: string[];
};

export default function ExplorePage() {
  const router = useRouter();
  const { isAdmin, profileId, user } = useAuth();
  const pinCacheRef = useRef<Map<string, BenchPin>>(new Map());
  const [benches, setBenches] = useState<BenchPin[]>([]);
  const [viewportBounds, setViewportBounds] = useState<ViewportBounds | null>(null);
  const [benchmarkedIDs, setBenchmarkedIDs] = useState<string[]>([]);
  const [filters, setFilters] = useState<ExploreFilters>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBenchID, setSelectedBenchID] = useState<string | null>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [addMode, setAddMode] = useState(false);
  const [moveMode, setMoveMode] = useState(false);
  const [tempPlacement, setTempPlacement] = useState<{ lat: number; lng: number } | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addStatus, setAddStatus] = useState<string | null>(null);
  const [addName, setAddName] = useState("");
  const [addNeighborhood, setAddNeighborhood] = useState("volunteer park");
  const [addType, setAddType] = useState("wooden");
  const [addDescription, setAddDescription] = useState("");
  const [locating, setLocating] = useState(false);
  const [sheetBenchID, setSheetBenchID] = useState<string | null>(null);
  const [sheetPin, setSheetPin] = useState<BenchPin | null>(null);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [carouselPad, setCarouselPad] = useState(48);
  const [toast, setToast] = useState<string | null>(null);
  const toastKey = useRef(0);
  const [wishlistIDs, setWishlistIDs] = useState<Set<string>>(() => new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<BenchPin[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const [addFormHeightVh, setAddFormHeightVh] = useState(ADD_FORM_PEEK_VH);
  const [addFormDragging, setAddFormDragging] = useState(false);
  const addFormDragStartY = useRef(0);
  const addFormDragStartVh = useRef(ADD_FORM_PEEK_VH);
  const flyToRef = useRef<(lat: number, lng: number) => void>(() => {});
  const [bootView, setBootView] = useState<SavedMapView | null>(null);
  const pinFetchGenRef = useRef(0);
  const pinAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isOnboardingComplete()) {
      router.replace("/onboarding");
    }
  }, [router]);

  useEffect(() => {
    if (showAddForm) {
      setAddFormHeightVh(ADD_FORM_EXPANDED_VH);
    }
  }, [showAddForm]);
  const carouselRef = useRef<HTMLDivElement>(null);
  const selectedCardRef = useRef<HTMLDivElement>(null);
  const currentBoundsRef = useRef<ViewportBounds | null>(null);
  const ignoreCarouselScrollRef = useRef(false);
  const scrollSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detailCacheRef = useRef<Map<string, { bench: Bench; reviews: BenchReview[]; fetchedWithPhotos: boolean }>>(new Map());
  const [detailVersion, setDetailVersion] = useState(0);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const applyFilters = useCallback((
    cache: Map<string, BenchPin>,
    f: ExploreFilters,
    bounds: ViewportBounds | null
  ): BenchPin[] => {
    let arr = Array.from(cache.values());
    if (bounds) {
      arr = arr.filter((b) => pinInBounds(b, bounds));
    }
    if (f.minRating) arr = arr.filter((b) => b.averageRating >= f.minRating!);
    if (f.types && f.types.length > 0) arr = arr.filter((b) => f.types!.includes(b.type));
    if (f.tags && f.tags.length > 0) {
      arr = arr.filter((b) => f.tags!.some((t) => (b.tags ?? []).includes(t)));
    }
    return arr;
  }, []);

  const pickSelection = useCallback((prev: string | null, mapPins: BenchPin[], bounds: ViewportBounds | null) => {
    if (prev && mapPins.some((b) => b.id === prev)) return prev;
    if (!bounds) return mapPins[0]?.id ?? null;
    const focus = centerFocusBounds(bounds);
    const centered = mapPins.filter((b) => pinInBounds(b, focus));
    return centered[0]?.id ?? mapPins[0]?.id ?? null;
  }, []);

  const refresh = useCallback(async (bounds: ViewportBounds) => {
    setError(null);
    pinAbortRef.current?.abort();
    const ac = new AbortController();
    pinAbortRef.current = ac;
    const gen = ++pinFetchGenRef.current;
    try {
      const data = await listBenchPins(bounds, filtersRef.current.minRating, {
        signal: ac.signal
      });
      if (gen !== pinFetchGenRef.current) return;
      const cache = pinCacheRef.current;
      for (const pin of data) {
        cache.set(pin.id, pin);
      }
      evictPinCache(cache, bounds);
      const filtered = applyFilters(cache, filtersRef.current, bounds);
      setBenches(filtered);
      setLoading(false);
      setSelectedBenchID((prev) => pickSelection(prev, filtered, bounds));
      trackEvent({
        name: "explore_loaded",
        metadata: { count: filtered.length, cached: cache.size, zoom: bounds.zoom ?? -1 }
      });
    } catch (err) {
      if (ac.signal.aborted || gen !== pinFetchGenRef.current) return;
      setError(err instanceof Error ? err.message : "unable to load benches");
      setLoading(false);
    }
  }, [applyFilters, pickSelection]);

  const handleBoundsChange = useCallback((bounds: ViewportBounds) => {
    currentBoundsRef.current = bounds;
    setViewportBounds(bounds);
    // Instantly narrow map pins to whatever is already cached in view.
    const filtered = applyFilters(pinCacheRef.current, filtersRef.current, bounds);
    setBenches(filtered);
    setSelectedBenchID((prev) => pickSelection(prev, filtered, bounds));
    refresh(bounds).catch(() => {});
  }, [applyFilters, pickSelection, refresh]);

  // Prefetch pins before Leaflet finishes: saved camera, else GPS nearby.
  useEffect(() => {
    const saved = readSavedMapView();
    if (saved) {
      setBootView(saved);
      const bounds = viewportAround(saved.lat, saved.lng, saved.zoom) as ViewportBounds;
      currentBoundsRef.current = bounds;
      setViewportBounds(bounds);
      refresh(bounds).catch(() => {});
      return;
    }
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const view: SavedMapView = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          zoom: NEARBY_ZOOM
        };
        setBootView(view);
        const bounds = viewportAround(view.lat, view.lng, view.zoom) as ViewportBounds;
        currentBoundsRef.current = bounds;
        setViewportBounds(bounds);
        refresh(bounds).catch(() => {});
      },
      () => {
        // Map will emit world bounds on GPS failure; no Seattle fallback.
      },
      { enableHighAccuracy: false, timeout: 2500, maximumAge: 120_000 }
    );
    return () => {
      pinAbortRef.current?.abort();
    };
  }, [refresh]);

  useEffect(() => {
    const filtered = applyFilters(pinCacheRef.current, filters, currentBoundsRef.current);
    setBenches(filtered);
    setSelectedBenchID((prev) => pickSelection(prev, filtered, currentBoundsRef.current));
  }, [filters, applyFilters, pickSelection]);

  const carouselBenches = useMemo(() => {
    if (!viewportBounds) return benches.slice(0, 12);
    const focus = centerFocusBounds(viewportBounds);
    const centered = benches.filter((b) => pinInBounds(b, focus));
    if (!selectedBenchID) return centered;
    if (centered.some((b) => b.id === selectedBenchID)) return centered;
    const selected = benches.find((b) => b.id === selectedBenchID);
    return selected ? [selected, ...centered] : centered;
  }, [benches, viewportBounds, selectedBenchID]);

  const toggleRating = useCallback((value: number) => {
    setFilters((prev) => {
      if (prev.minRating === value) {
        const next = { ...prev };
        delete next.minRating;
        return next;
      }
      return { ...prev, minRating: value };
    });
  }, []);

  const toggleType = useCallback((value: string) => {
    setFilters((prev) => {
      const current = prev.types ?? [];
      const next = current.includes(value)
        ? current.filter((t) => t !== value)
        : [...current, value];
      if (next.length === 0) {
        const out = { ...prev };
        delete out.types;
        return out;
      }
      return { ...prev, types: next };
    });
  }, []);

  const toggleTag = useCallback((value: string) => {
    setFilters((prev) => {
      const current = prev.tags ?? [];
      const next = current.includes(value)
        ? current.filter((t) => t !== value)
        : [...current, value];
      if (next.length === 0) {
        const out = { ...prev };
        delete out.tags;
        return out;
      }
      return { ...prev, tags: next };
    });
  }, []);

  useEffect(() => {
    if (profileId) {
      getProfile(profileId, { slim: true })
        .then((p) => setBenchmarkedIDs(p.benchmarkedBenchIDs))
        .catch(() => {});
      listWishlist(profileId)
        .then((ids) => setWishlistIDs(new Set(ids)))
        .catch(() => {});
    } else {
      setWishlistIDs(new Set());
    }
  }, [profileId]);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    searchTimerRef.current = setTimeout(() => {
      searchBenches(q, 12)
        .then((rows) => {
          setSearchResults(rows);
          setSearchOpen(true);
        })
        .catch(() => setSearchResults([]))
        .finally(() => setSearchLoading(false));
    }, 220);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!searchWrapRef.current?.contains(e.target as Node)) {
        setSearchOpen(false);
        if (!searchQuery.trim()) setSearchExpanded(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [searchQuery]);

  const handleWishlistChange = useCallback((benchId: string, next: boolean) => {
    setWishlistIDs((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(benchId);
      else copy.delete(benchId);
      return copy;
    });
  }, []);

  useEffect(() => {
    if (carouselBenches.length > 0 && !selectedBenchID) {
      setSelectedBenchID(carouselBenches[0].id);
    }
  }, [carouselBenches, selectedBenchID]);

  const hasFilters = Boolean(
    filters.minRating ||
      (filters.types && filters.types.length > 0) ||
      (filters.tags && filters.tags.length > 0)
  );
  const selectedBench = benches.find((b) => b.id === selectedBenchID);
  const sheetCached = sheetBenchID ? detailCacheRef.current.get(sheetBenchID) : undefined;

  // detailVersion bumps when prefetch finishes so sheet re-renders from cache.
  void detailVersion;

  const scrollCarouselToSelected = useCallback((behavior: ScrollBehavior = "smooth") => {
    const scroller = carouselRef.current;
    const card = selectedCardRef.current;
    if (!scroller || !card) return;
    ignoreCarouselScrollRef.current = true;
    const target =
      card.offsetLeft - (scroller.clientWidth - card.offsetWidth) / 2;
    scroller.scrollTo({ left: Math.max(0, target), behavior });
    window.setTimeout(() => {
      ignoreCarouselScrollRef.current = false;
    }, behavior === "smooth" ? 350 : 50);
  }, []);

  const prefetchBench = useCallback(async (benchId: string, options?: { withPhotos?: boolean }) => {
    const withPhotos = Boolean(options?.withPhotos);
    const existing = detailCacheRef.current.get(benchId);
    if (existing && (!withPhotos || existing.fetchedWithPhotos)) return;
    try {
      const [bench, reviews] = await Promise.all([
        getBench(benchId),
        listBenchReviews(benchId, { lite: !withPhotos })
      ]);
      detailCacheRef.current.set(benchId, { bench, reviews, fetchedWithPhotos: withPhotos });
      setDetailVersion((v) => v + 1);
    } catch {
      // Prefetch is best-effort; sheet can retry on open.
    }
  }, []);

  const openBenchSheet = useCallback((bench: BenchPin) => {
    setSelectedBenchID(bench.id);
    setSheetPin(bench);
    setSheetBenchID(bench.id);
    trackEvent({ name: "bench_opened_from_explore", benchId: bench.id });
    const cached = detailCacheRef.current.get(bench.id);
    if (!cached?.fetchedWithPhotos) {
      setSheetLoading(true);
      prefetchBench(bench.id, { withPhotos: true }).finally(() => setSheetLoading(false));
    } else {
      setSheetLoading(false);
    }
  }, [prefetchBench]);

  const handleSearchSelect = useCallback(
    (pin: BenchPin) => {
      pinCacheRef.current.set(pin.id, pin);
      setSearchQuery(pin.name);
      setSearchOpen(false);
      setSearchExpanded(false);
      setSearchResults([]);
      flyToRef.current(pin.latitude, pin.longitude);
      openBenchSheet(pin);
      trackEvent({ name: "bench_search_selected", benchId: pin.id });
    },
    [openBenchSheet]
  );

  const closeBenchSheet = useCallback(() => {
    setSheetBenchID(null);
    setSheetPin(null);
    setSheetLoading(false);
  }, []);

  const handleSheetReviewsUpdated = useCallback((next: BenchReview[]) => {
    if (!sheetBenchID) return;
    const prev = detailCacheRef.current.get(sheetBenchID);
    if (!prev) return;
    detailCacheRef.current.set(sheetBenchID, { ...prev, reviews: next, fetchedWithPhotos: true });
    setDetailVersion((v) => v + 1);
  }, [sheetBenchID]);

  const showToast = useCallback((message: string) => {
    toastKey.current += 1;
    setToast(message);
  }, []);

  const handleDeleteBench = useCallback(async (benchId: string) => {
    await deleteBench(benchId);
    pinCacheRef.current.delete(benchId);
    detailCacheRef.current.delete(benchId);
    setBenches((prev) => prev.filter((b) => b.id !== benchId));
    setSelectedBenchID((prev) => (prev === benchId ? null : prev));
    setBenchmarkedIDs((prev) => prev.filter((id) => id !== benchId));
    setDetailVersion((v) => v + 1);
    showToast("bench deleted");
    if (currentBoundsRef.current) {
      await refresh(currentBoundsRef.current);
    }
  }, [refresh, showToast]);

  const handleBenchUpdated = useCallback((updated: Bench) => {
    const prevPin = pinCacheRef.current.get(updated.id);
    const nextPin: BenchPin = {
      id: updated.id,
      name: updated.name,
      neighborhood: updated.neighborhood,
      type: updated.type,
      averageRating: updated.averageRating,
      latitude: updated.latitude || prevPin?.latitude || 0,
      longitude: updated.longitude || prevPin?.longitude || 0,
      reviewCount: prevPin?.reviewCount ?? 0,
      tags: updated.tags?.length ? updated.tags : prevPin?.tags ?? []
    };
    pinCacheRef.current.set(updated.id, nextPin);
    setBenches((prev) => prev.map((b) => (b.id === updated.id ? { ...b, ...nextPin } : b)));
    setSheetPin((prev) => (prev?.id === updated.id ? { ...prev, ...nextPin } : prev));
    const detail = detailCacheRef.current.get(updated.id);
    if (detail) {
      detailCacheRef.current.set(updated.id, {
        ...detail,
        bench: { ...detail.bench, ...updated, latitude: nextPin.latitude, longitude: nextPin.longitude }
      });
    } else {
      detailCacheRef.current.set(updated.id, {
        bench: { ...updated, latitude: nextPin.latitude, longitude: nextPin.longitude },
        reviews: [],
        fetchedWithPhotos: false
      });
    }
    setDetailVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    const measure = () => {
      setCarouselPad(Math.max(16, (el.clientWidth - CAROUSEL_CARD_WIDTH) / 2));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [carouselBenches.length, loading]);

  useEffect(() => {
    if (!selectedBenchID || carouselBenches.length === 0) return;
    scrollCarouselToSelected("smooth");
    void prefetchBench(selectedBenchID);
  }, [selectedBenchID, carouselBenches, scrollCarouselToSelected, prefetchBench]);

  useEffect(() => {
    if (!sheetBenchID) return;
    const cached = detailCacheRef.current.get(sheetBenchID);
    if (cached?.fetchedWithPhotos) {
      setSheetLoading(false);
      return;
    }
    setSheetLoading(true);
    prefetchBench(sheetBenchID, { withPhotos: true }).finally(() => setSheetLoading(false));
  }, [sheetBenchID, prefetchBench]);

  const handleCarouselScroll = useCallback(() => {
    if (ignoreCarouselScrollRef.current) return;
    const scroller = carouselRef.current;
    if (!scroller || carouselBenches.length === 0) return;
    if (scrollSettleTimerRef.current) clearTimeout(scrollSettleTimerRef.current);
    scrollSettleTimerRef.current = setTimeout(() => {
      const centerX = scroller.scrollLeft + scroller.clientWidth / 2;
      let bestId = carouselBenches[0]?.id ?? null;
      let bestDist = Number.POSITIVE_INFINITY;
      const children = Array.from(scroller.children) as HTMLElement[];
      children.forEach((child, i) => {
        const mid = child.offsetLeft + child.offsetWidth / 2;
        const dist = Math.abs(mid - centerX);
        if (dist < bestDist && carouselBenches[i]) {
          bestDist = dist;
          bestId = carouselBenches[i].id;
        }
      });
      if (bestId && bestId !== selectedBenchID) {
        const bench = carouselBenches.find((b) => b.id === bestId);
        if (bench) {
          setSelectedBenchID(bench.id);
          flyToRef.current(bench.latitude, bench.longitude);
        }
      }
    }, 80);
  }, [carouselBenches, selectedBenchID]);

  const handleSelectFromMap = useCallback((bench: BenchPin) => {
    if (bench.id === selectedBenchID) {
      openBenchSheet(bench);
      return;
    }
    setSelectedBenchID(bench.id);
    flyToRef.current(bench.latitude, bench.longitude);
  }, [selectedBenchID, openBenchSheet]);

  const handleSelectFromCard = useCallback((bench: BenchPin) => {
    if (bench.id === selectedBenchID) {
      openBenchSheet(bench);
      return;
    }
    setSelectedBenchID(bench.id);
    flyToRef.current(bench.latitude, bench.longitude);
  }, [selectedBenchID, openBenchSheet]);

  const handleMapReady = useCallback((flyTo: (lat: number, lng: number) => void) => {
    flyToRef.current = flyTo;
  }, []);

  const handleLocateMe = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setError("location is unavailable on this device");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        flyToRef.current(pos.coords.latitude, pos.coords.longitude);
        setLocating(false);
        trackEvent({ name: "explore_locate_me" });
      },
      (err) => {
        setLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setError("enable location access to center the map on you");
        } else {
          setError("couldn't get your location — try again");
        }
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 15_000 }
    );
  }, []);

  const handleMapClick = useCallback((lat: number, lng: number) => {
    setTempPlacement({ lat, lng });
  }, []);

  const handlePlusClick = useCallback(() => {
    if (!isAdmin) return;
    setAddMode(true);
    setMoveMode(false);
    setTempPlacement(null);
  }, [isAdmin]);

  const handleMoveClick = useCallback(() => {
    if (!selectedBench) return;
    setMoveMode(true);
    setAddMode(false);
    setAddStatus(null);
    setTempPlacement({ lat: selectedBench.latitude, lng: selectedBench.longitude });
  }, [selectedBench]);

  const handleConfirmAdd = useCallback(() => {
    if (!tempPlacement) return;
    setAddName("");
    setAddDescription("");
    setAddStatus(null);
    setShowAddForm(true);
  }, [tempPlacement]);

  const handleCancelAdd = useCallback(() => {
    setAddMode(false);
    setMoveMode(false);
    setTempPlacement(null);
    setShowAddForm(false);
  }, []);

  const onAddFormPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setAddFormDragging(true);
    addFormDragStartY.current = e.clientY;
    addFormDragStartVh.current = addFormHeightVh;
  };

  const onAddFormPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!addFormDragging) return;
    const deltaPx = addFormDragStartY.current - e.clientY;
    const deltaVh = (deltaPx / window.innerHeight) * 100;
    setAddFormHeightVh(
      clamp(addFormDragStartVh.current + deltaVh, ADD_FORM_PEEK_VH, ADD_FORM_EXPANDED_VH)
    );
  };

  const onAddFormPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!addFormDragging) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setAddFormDragging(false);
    const mid = (ADD_FORM_PEEK_VH + ADD_FORM_EXPANDED_VH) / 2;
    setAddFormHeightVh(addFormHeightVh >= mid ? ADD_FORM_EXPANDED_VH : ADD_FORM_PEEK_VH);
  };

  const handleConfirmMove = useCallback(async () => {
    if (!tempPlacement || !selectedBenchID) return;
    try {
      const updated = await updateBenchLocation(selectedBenchID, tempPlacement.lat, tempPlacement.lng);
      setAddStatus(`moved ${updated.name}`);
      trackEvent({ name: "bench_moved", benchId: selectedBenchID });
      pinCacheRef.current.delete(selectedBenchID);
      if (currentBoundsRef.current) await refresh(currentBoundsRef.current);
      setTimeout(() => {
        setAddMode(false);
        setMoveMode(false);
        setTempPlacement(null);
        setAddStatus(null);
      }, 1200);
    } catch (err) {
      setAddStatus(err instanceof Error ? err.message : "unable to move bench");
    }
  }, [tempPlacement, selectedBenchID, refresh]);

  const handleAddSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!tempPlacement || !isAdmin) return;
      try {
        const created = await createBench({
          name: addName,
          neighborhood: addNeighborhood,
          type: addType,
          description: addDescription,
          latitude: tempPlacement.lat,
          longitude: tempPlacement.lng,
          averageRating: 0,
          viewScore: 0,
          remotenessScore: 0,
          popularityScore: 0,
          tags: ["user-submitted"]
        });
        trackEvent({ name: "bench_created", benchId: created.id });
        if (currentBoundsRef.current) refresh(currentBoundsRef.current).catch(() => {});
        handleCancelAdd();
        showToast("bench submitted");
      } catch (err) {
        setAddStatus(err instanceof Error ? err.message : "unable to add bench");
      }
    },
    [tempPlacement, isAdmin, addName, addNeighborhood, addType, addDescription, refresh, handleCancelAdd, showToast]
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        paddingBottom: 0,
        background: "var(--page)",
        zIndex: 1
      }}
    >
      {/* Map layer */}
      <div style={{ position: "absolute", inset: 0, zIndex: 0, paddingTop: 56 }}>
        <ExploreMap
          benches={benches}
          selectedBenchID={selectedBenchID}
          onSelectBench={handleSelectFromMap}
          onMapReady={handleMapReady}
          onBoundsChange={handleBoundsChange}
          addMode={addMode || moveMode}
          tempPlacement={tempPlacement}
          onMapClick={handleMapClick}
          benchmarkedBenchIDs={benchmarkedIDs}
          enableFogOfWar={false}
          centerOnUserOnLoad
          bootView={bootView}
        />
      </div>

      {/* Header overlay */}
      <header
        style={{
          position: "relative",
          zIndex: 2,
          padding: "12px 16px 10px",
          background: "linear-gradient(to bottom, rgba(245,239,228,0.95) 0%, rgba(245,239,228,0.7) 70%, transparent 100%)",
          borderBottom: "1px solid rgba(218,207,191,0.4)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <BenchmarkLogo size={32} />
          <div style={{ flex: 1, minWidth: 0 }} />
          <div
            ref={searchWrapRef}
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexShrink: 0
            }}
          >
            {searchExpanded ? (
              <input
                type="search"
                autoFocus
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => {
                  if (searchResults.length > 0) setSearchOpen(true);
                }}
                onBlur={() => {
                  // Keep open while interacting with results; collapse if empty shortly after.
                  window.setTimeout(() => {
                    if (!searchQuery.trim() && !searchOpen) setSearchExpanded(false);
                  }, 180);
                }}
                placeholder="name or place…"
                aria-label="Search benches by name or location"
                style={{
                  width: "min(52vw, 220px)",
                  height: 36,
                  borderRadius: 999,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  padding: "0 14px",
                  fontSize: 13,
                  fontFamily: "inherit",
                  transition: "width 0.2s ease"
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSearchExpanded(true);
                  setSearchOpen(true);
                }}
                aria-label="Open search"
                title="Search"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  display: "grid",
                  placeItems: "center",
                  cursor: "pointer",
                  color: "var(--text-primary)",
                  padding: 0
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-3.5-3.5" />
                </svg>
              </button>
            )}
            {searchExpanded && searchOpen && searchQuery.trim().length >= 2 ? (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  right: 0,
                  width: "min(86vw, 320px)",
                  maxHeight: 280,
                  overflowY: "auto",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 14,
                  boxShadow: "0 10px 28px rgba(0,0,0,0.14)",
                  zIndex: 20
                }}
              >
                {searchLoading ? (
                  <p className="muted" style={{ margin: 0, padding: 12, fontSize: 13 }}>searching…</p>
                ) : searchResults.length === 0 ? (
                  <p className="muted" style={{ margin: 0, padding: 12, fontSize: 13 }}>no benches found</p>
                ) : (
                  searchResults.map((pin) => (
                    <button
                      key={pin.id}
                      type="button"
                      onClick={() => handleSearchSelect(pin)}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 12px",
                        border: "none",
                        borderBottom: "1px solid var(--border)",
                        background: "transparent",
                        cursor: "pointer",
                        fontFamily: "inherit"
                      }}
                    >
                      <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{pin.name}</span>
                      <span className="muted" style={{ fontSize: 11 }}>
                        {pin.neighborhood}
                        {pin.type && pin.type !== "unknown" ? ` · ${pin.type}` : ""}
                      </span>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setIsFilterOpen((o) => !o)}
            style={{
              fontSize: 12,
              padding: "6px 10px",
              height: 32,
              borderRadius: 999,
              border: hasFilters ? "1px solid var(--accent)" : "1px solid var(--border)",
              background: hasFilters ? "var(--accent-soft)" : "var(--surface)",
              color: hasFilters ? "var(--accent)" : "var(--text-primary)",
              fontWeight: hasFilters ? 600 : 500,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.2s",
              flexShrink: 0
            }}
          >
            filters{hasFilters ? " ●" : ""}
          </button>
        </div>

        {isFilterOpen && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span className="muted" style={{ fontSize: 11, fontWeight: 600, width: 50 }}>rating</span>
              {[3.0, 4.0, 4.5].map((r) => {
                const active = filters.minRating === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggleRating(r)}
                    style={{
                      fontSize: 12, padding: "5px 10px", height: 30, borderRadius: 999,
                      border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
                      background: active ? "var(--accent)" : "var(--surface)",
                      color: active ? "#f6f5f1" : "var(--text-primary)",
                      fontWeight: active ? 600 : 400, cursor: "pointer",
                      fontFamily: "inherit", transition: "all 0.15s"
                    }}
                  >
                    {r}+ ★
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span className="muted" style={{ fontSize: 11, fontWeight: 600, width: 50 }}>type</span>
              {Object.entries(BENCH_TYPE_LABELS)
                .filter(([value]) => value !== "unknown")
                .map(([value, label]) => {
                const active = (filters.types ?? []).includes(value);
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => toggleType(value)}
                    style={{
                      fontSize: 12, padding: "5px 10px", height: 30, borderRadius: 999,
                      border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
                      background: active ? "var(--accent)" : "var(--surface)",
                      color: active ? "#f6f5f1" : "var(--text-primary)",
                      fontWeight: active ? 600 : 400, cursor: "pointer",
                      fontFamily: "inherit", transition: "all 0.15s"
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span className="muted" style={{ fontSize: 11, fontWeight: 600, width: 50 }}>tags</span>
              {Object.entries(BENCH_FACET_TAG_LABELS).map(([value, label]) => {
                const active = (filters.tags ?? []).includes(value);
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => toggleTag(value)}
                    style={{
                      fontSize: 12, padding: "5px 10px", height: 30, borderRadius: 999,
                      border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
                      background: active ? "var(--accent)" : "var(--surface)",
                      color: active ? "#f6f5f1" : "var(--text-primary)",
                      fontWeight: active ? 600 : 400, cursor: "pointer",
                      fontFamily: "inherit", transition: "all 0.15s"
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {hasFilters && (
              <button
                type="button"
                onClick={() => setFilters({})}
                style={{
                  alignSelf: "flex-start", fontSize: 11, padding: "4px 10px",
                  height: 26, borderRadius: 999, border: "1px solid var(--danger)",
                  background: "transparent", color: "var(--danger)",
                  cursor: "pointer", fontFamily: "inherit"
                }}
              >
                clear all filters
              </button>
            )}
            <p className="muted" style={{ margin: 0, fontSize: 11 }}>
              showing {carouselBenches.length} nearby
              {benches.length !== carouselBenches.length ? ` · ${benches.length} on map` : ""}
            </p>
          </div>
        )}
      </header>

      {/* Map floating controls — vertical stack above the carousel */}
      <div
        style={{
          position: "absolute",
          right: 16,
          bottom: 220,
          zIndex: 3,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          alignItems: "center"
        }}
      >
        {!addMode && !moveMode ? (
          <>
            <button
              type="button"
              onClick={handleLocateMe}
              disabled={locating}
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                background: "var(--surface)",
                border: "2px solid var(--border)",
                color: "var(--text-primary)",
                cursor: locating ? "wait" : "pointer",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                opacity: locating ? 0.7 : 1
              }}
              aria-label="Center map on my location"
              title="Center on my location"
            >
              <LocateIcon />
            </button>
            {user && (
              <>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={handleMoveClick}
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      display: "grid",
                      placeItems: "center",
                      background: "var(--surface)",
                      border: "2px solid var(--border)",
                      color: "var(--text-primary)",
                      cursor: selectedBench ? "pointer" : "not-allowed",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                      opacity: selectedBench ? 1 : 0.5
                    }}
                    disabled={!selectedBench}
                    aria-label="Move selected bench"
                    title={selectedBench ? "Move selected bench pin" : "Select a bench first"}
                  >
                    <MoveIcon />
                  </button>
                )}
                <button
                  type="button"
                  className="button-primary"
                  onClick={handlePlusClick}
                  disabled={!isAdmin}
                  title={isAdmin ? "Add bench" : "bench creation is disabled"}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    display: "grid",
                    placeItems: "center",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                    opacity: isAdmin ? 1 : 0.45,
                    cursor: isAdmin ? "pointer" : "not-allowed"
                  }}
                  aria-label={isAdmin ? "Add bench" : "Bench creation is disabled"}
                >
                  <PlusIcon />
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={handleCancelAdd}
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                background: "var(--surface)",
                border: "2px solid var(--border)",
                color: "var(--muted)",
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
              }}
              aria-label="Cancel"
            >
              <TrashIcon />
            </button>
            <button
              type="button"
              className="button-primary"
              onClick={addMode ? handleConfirmAdd : handleConfirmMove}
              disabled={!tempPlacement}
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                opacity: tempPlacement ? 1 : 0.5,
                cursor: tempPlacement ? "pointer" : "not-allowed"
              }}
              aria-label="Confirm location"
            >
              <CheckIcon />
            </button>
          </>
        )}
      </div>

      {/* Add mode hint */}
      {(addMode || moveMode) && (
        <div
          style={{
            position: "absolute",
            left: 16,
            right: 16,
            top: 70,
            zIndex: 2,
            padding: "10px 14px",
            background: "rgba(45,106,79,0.95)",
            color: "white",
            fontSize: 13,
            borderRadius: "var(--radius)",
            textAlign: "center"
          }}
        >
          {addMode
            ? "tap the map to place your new bench"
            : `tap map to reposition ${selectedBench?.name ?? "bench"}`}
        </div>
      )}

      {moveMode && addStatus && (
        <div
          style={{
            position: "absolute",
            left: 16,
            right: 16,
            top: 114,
            zIndex: 2,
            padding: "8px 12px",
            background: "rgba(45,106,79,0.92)",
            color: "#f7f1e8",
            borderRadius: "var(--radius)",
            fontSize: 12,
            textAlign: "center"
          }}
        >
          {addStatus}
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div
          style={{
            position: "relative",
            zIndex: 2,
            padding: "8px 16px",
            background: "rgba(166,63,50,0.12)",
            color: "var(--danger)",
            fontSize: 13
          }}
        >
          {error}
        </div>
      )}

      {/* Floating carousel */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 2,
          padding: "12px 16px 96px",
          background: "linear-gradient(to top, rgba(245,239,228,0.98) 0%, rgba(245,239,228,0.85) 60%, transparent 100%)",
          borderTop: "1px solid rgba(218,207,191,0.5)"
        }}
      >
        {loading ? (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>loading benches…</p>
        ) : error ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ margin: 0, fontSize: 13, color: "var(--danger)" }}>{error}</p>
            <button
              type="button"
              className="button-secondary"
              style={{ alignSelf: "flex-start", fontSize: 12 }}
              onClick={() => currentBoundsRef.current && refresh(currentBoundsRef.current)}
            >
              retry
            </button>
          </div>
        ) : carouselBenches.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            {benches.length > 0 ? "pan to center a bench" : "no benches nearby"}
          </p>
        ) : (
          <div
            ref={carouselRef}
            className="explore-carousel"
            onScroll={handleCarouselScroll}
            style={{
              display: "flex",
              gap: CAROUSEL_GAP,
              overflowX: "auto",
              paddingBottom: 4,
              paddingLeft: carouselPad,
              paddingRight: carouselPad,
              scrollSnapType: "x mandatory",
              scrollPaddingInline: carouselPad,
              WebkitOverflowScrolling: "touch"
            }}
          >
            {carouselBenches.map((bench) => {
              const isSelected = bench.id === selectedBenchID;
              return (
                <div
                  key={bench.id}
                  ref={isSelected ? selectedCardRef : undefined}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleSelectFromCard(bench);
                    }
                  }}
                  onClick={() => handleSelectFromCard(bench)}
                  style={{
                    flexShrink: 0,
                    width: CAROUSEL_CARD_WIDTH,
                    padding: 12,
                    borderRadius: "var(--radius)",
                    background: isSelected ? "var(--surface)" : "rgba(247,241,232,0.95)",
                    border: `1.5px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
                    boxShadow: isSelected ? "0 4px 16px rgba(0,0,0,0.08)" : "0 2px 8px rgba(0,0,0,0.04)",
                    scrollSnapAlign: "center",
                    cursor: "pointer",
                    transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4
                  }}
                >
                  <p style={{ margin: 0, fontWeight: isSelected ? 700 : 600, fontSize: 14 }}>{bench.name}</p>
                  <p className="muted" style={{ margin: 0, fontSize: 11 }}>
                    {bench.neighborhood} • {bench.averageRating.toFixed(1)}★ · {bench.reviewCount ?? 0} benchmark{(bench.reviewCount ?? 0) === 1 ? "" : "s"}
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openBenchSheet(bench);
                    }}
                    style={{
                      marginTop: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--accent)",
                      textDecoration: "none",
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      textAlign: "left"
                    }}
                  >
                    open →
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add bench form sheet — above bottom nav, draggable + scrollable */}
      {showAddForm && tempPlacement && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            pointerEvents: "auto"
          }}
          onClick={handleCancelAdd}
        >
          <div
            className="surface-card"
            role="dialog"
            aria-modal="true"
            aria-label="Add a bench"
            style={{
              width: "100%",
              maxWidth: 420,
              height: `${addFormHeightVh}vh`,
              maxHeight: "calc(100dvh - var(--safe-top, 0px))",
              display: "flex",
              flexDirection: "column",
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
              borderTopLeftRadius: "var(--radius-lg, 16px)",
              borderTopRightRadius: "var(--radius-lg, 16px)",
              boxShadow: "0 -8px 32px rgba(0,0,0,0.18)",
              overflow: "hidden",
              transition: addFormDragging ? "none" : "height 0.22s ease",
              paddingBottom: "max(20px, var(--safe-bottom))"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              onPointerDown={onAddFormPointerDown}
              onPointerMove={onAddFormPointerMove}
              onPointerUp={onAddFormPointerUp}
              onPointerCancel={onAddFormPointerUp}
              style={{
                flexShrink: 0,
                padding: "10px 20px 8px",
                cursor: "grab",
                touchAction: "none",
                userSelect: "none"
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 4,
                  borderRadius: 999,
                  background: "var(--border)",
                  margin: "0 auto 12px"
                }}
              />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <h2 style={{ margin: 0, fontSize: 18, textTransform: "lowercase" }}>add a bench</h2>
                <button
                  type="button"
                  onClick={handleCancelAdd}
                  aria-label="Close add bench form"
                  style={{
                    border: "none",
                    background: "var(--elevated)",
                    color: "var(--text-secondary)",
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    cursor: "pointer",
                    fontSize: 18,
                    lineHeight: 1
                  }}
                >
                  ×
                </button>
              </div>
              <p className="muted" style={{ margin: "8px 0 0", fontSize: 13 }}>
                pin placed at {tempPlacement.lat.toFixed(5)}, {tempPlacement.lng.toFixed(5)}
              </p>
            </div>

            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                WebkitOverflowScrolling: "touch",
                padding: "8px 20px 20px"
              }}
            >
              <form onSubmit={handleAddSubmit} style={{ display: "grid", gap: 12 }}>
                <label>
                  name
                  <input
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    required
                    style={{ width: "100%", marginTop: 4 }}
                  />
                </label>
                <label>
                  neighborhood
                  <input
                    value={addNeighborhood}
                    onChange={(e) => setAddNeighborhood(e.target.value)}
                    required
                    style={{ width: "100%", marginTop: 4 }}
                  />
                </label>
                <label>
                  type
                  <select
                    value={addType}
                    onChange={(e) => setAddType(e.target.value)}
                    style={{ width: "100%", marginTop: 4 }}
                  >
                    {Object.entries(BENCH_TYPE_LABELS)
                      .filter(([value]) => value !== "unknown")
                      .map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  description
                  <textarea
                    value={addDescription}
                    onChange={(e) => setAddDescription(e.target.value)}
                    rows={3}
                    style={{ width: "100%", marginTop: 4 }}
                  />
                </label>
                <button type="submit" className="button-primary" style={{ width: "100%", marginTop: 4 }}>
                  confirm bench
                </button>
              </form>
              {addStatus && <p style={{ margin: "12px 0 0", color: "var(--accent)", fontSize: 13 }}>{addStatus}</p>}
            </div>
          </div>
        </div>
      )}

      {sheetPin && (
        <BenchExploreSheet
          pin={sheetPin}
          bench={sheetCached?.bench ?? null}
          reviews={sheetCached?.reviews ?? []}
          loading={sheetLoading && !sheetCached?.fetchedWithPhotos}
          onClose={closeBenchSheet}
          onReviewsUpdated={handleSheetReviewsUpdated}
          onDelete={isAdmin ? handleDeleteBench : undefined}
          onBenchUpdated={isAdmin ? handleBenchUpdated : undefined}
          wishlisted={wishlistIDs.has(sheetPin.id)}
          onWishlistChange={handleWishlistChange}
          onToast={showToast}
        />
      )}
      {toast && <Toast key={toastKey.current} message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
