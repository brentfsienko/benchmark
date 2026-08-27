"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker, MarkerClusterGroup } from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import type { BenchPin } from "@/src/lib/types";
import {
  NEARBY_ZOOM,
  WORLD_MAP_CENTER,
  WORLD_ZOOM,
  normalizeViewportBounds,
  readSavedMapView,
  writeSavedMapView,
  type SavedMapView
} from "@/src/lib/map-view";
import { FogOverlay } from "./fog-overlay";

export type ViewportBounds = {
  sw_lat: number;
  sw_lng: number;
  ne_lat: number;
  ne_lng: number;
  zoom?: number;
};

const GREEN_LAKE_CENTER = { lat: 47.6798, lng: -122.3288 } as const; // fog / Seattle challenge only
const VOLUNTEER_PARK_CENTER = { lat: 47.6298, lng: -122.3142 } as const;
/** Shift fly-to center south so pins land in the clear map above the carousel. */
const VISUAL_CENTER_OFFSET_Y_PX = 110;

function benchPinSvg(selected: boolean, benchmarked?: boolean): string {
  const size = selected ? 32 : 24;
  const fill = benchmarked ? "#2d6a4f" : selected ? "#2d6a4f" : "#f7f1e8";
  const stroke = selected ? "#23201b" : benchmarked ? "#2d6a4f" : "#dacfbf";
  const inner = benchmarked && !selected ? "#dceadf" : selected ? "#f7f1e8" : "#2d6a4f";
  const check = benchmarked
    ? `<path d="M8.5 12.5l2 2 5-5" stroke="${inner}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`
    : `<circle cx="12" cy="12" r="3.5" fill="${inner}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
    ${check}
  </svg>`;
}

function tempPinSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" fill="#2d6a4f" stroke="#23201b" stroke-width="2"/>
    <line x1="12" y1="7" x2="12" y2="17" stroke="#f7f1e8" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="7" y1="12" x2="17" y2="12" stroke="#f7f1e8" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`;
}

function userLocationSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="7" fill="#3b82f6" fill-opacity="0.22" />
    <circle cx="12" cy="12" r="4.5" fill="#3b82f6" stroke="#ffffff" stroke-width="2"/>
  </svg>`;
}

function clusterPinHtml(count: number): string {
  const size = count >= 100 ? 48 : count >= 25 ? 42 : count >= 10 ? 36 : 32;
  return `<div class="bench-cluster-pin" style="width:${size}px;height:${size}px;line-height:${size}px">${count}</div>`;
}

type ExploreMapProps = {
  benches: BenchPin[];
  selectedBenchID: string | null;
  onSelectBench: (bench: BenchPin) => void;
  onMapReady?: (flyTo: (lat: number, lng: number) => void) => void;
  onBoundsChange?: (bounds: ViewportBounds) => void;
  addMode?: boolean;
  tempPlacement?: { lat: number; lng: number } | null;
  onMapClick?: (lat: number, lng: number) => void;
  benchmarkedBenchIDs?: string[];
  enableFogOfWar?: boolean;
  /** Fly to the user's GPS position once when the map first loads. */
  centerOnUserOnLoad?: boolean;
  /** Location already resolved by the page (GPS / saved) so map can skip a second wait. */
  bootView?: SavedMapView | null;
};

export function ExploreMap({
  benches,
  selectedBenchID,
  onSelectBench,
  onMapReady,
  onBoundsChange,
  addMode = false,
  tempPlacement = null,
  onMapClick,
  benchmarkedBenchIDs = [],
  enableFogOfWar = true,
  centerOnUserOnLoad = true,
  bootView = null
}: ExploreMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);
  const clusterGroupRef = useRef<MarkerClusterGroup | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const markersByIdRef = useRef<globalThis.Map<string, Marker>>(new globalThis.Map());
  const benchesRef = useRef(benches);
  benchesRef.current = benches;
  const selectedBenchIDRef = useRef(selectedBenchID);
  selectedBenchIDRef.current = selectedBenchID;
  const onSelectBenchRef = useRef(onSelectBench);
  onSelectBenchRef.current = onSelectBench;
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;
  const tempMarkerRef = useRef<Marker | null>(null);
  const vpMarkerRef = useRef<Marker | null>(null);
  const userMarkerRef = useRef<Marker | null>(null);
  const geoWatchIDRef = useRef<number | null>(null);
  const boundsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onBoundsChangeRef = useRef(onBoundsChange);
  onBoundsChangeRef.current = onBoundsChange;
  const onMapReadyRef = useRef(onMapReady);
  onMapReadyRef.current = onMapReady;
  const bootViewRef = useRef(bootView);
  bootViewRef.current = bootView;
  const appliedBootRef = useRef(false);
  const [mounted, setMounted] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [clusterReady, setClusterReady] = useState(false);

  const pushBounds = useCallback((map: LeafletMap) => {
    const b = map.getBounds();
    const normalized = normalizeViewportBounds({
      sw_lat: b.getSouthWest().lat,
      sw_lng: b.getSouthWest().lng,
      ne_lat: b.getNorthEast().lat,
      ne_lng: b.getNorthEast().lng,
      zoom: map.getZoom()
    });
    onBoundsChangeRef.current?.(normalized);
  }, []);

  /** Immediate emit for first paint; debounced emit for pan/zoom. */
  const emitBoundsNow = useCallback(
    (map: LeafletMap) => {
      if (boundsTimerRef.current) clearTimeout(boundsTimerRef.current);
      pushBounds(map);
    },
    [pushBounds]
  );

  const emitBounds = useCallback(
    (map: LeafletMap) => {
      if (boundsTimerRef.current) clearTimeout(boundsTimerRef.current);
      boundsTimerRef.current = setTimeout(() => pushBounds(map), 450);
    },
    [pushBounds]
  );

  const emitBoundsNowRef = useRef(emitBoundsNow);
  emitBoundsNowRef.current = emitBoundsNow;
  const emitBoundsRef = useRef(emitBounds);
  emitBoundsRef.current = emitBounds;
  const centerOnUserRef = useRef(centerOnUserOnLoad);
  centerOnUserRef.current = centerOnUserOnLoad;

  useEffect(() => {
    setMounted(true);
  }, []);

  // Create the map as soon as the container has a real size. Tiles first; clustering second.
  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;
    const el = mapRef.current;
    if (!el) return;

    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    const retryTimers: number[] = [];

    const fixSize = () => {
      const map = mapInstanceRef.current;
      if (!map) return;
      map.invalidateSize({ pan: false });
    };

    const setupMap = async () => {
      const leafletMod = await import("leaflet");
      if (cancelled || !mapRef.current || mapInstanceRef.current) return;
      const L = leafletMod.default;

      const proto = L.Icon.Default.prototype as unknown as Record<string, unknown>;
      if ("_getIconUrl" in proto) delete proto["_getIconUrl"];
      L.Icon.Default.mergeOptions({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png"
      });

      const tryCreate = () => {
        const node = mapRef.current;
        if (cancelled || !node || mapInstanceRef.current) return;
        const { width, height } = node.getBoundingClientRect();
        if (width < 16 || height < 16) return;

        const saved = readSavedMapView();
        const boot = bootViewRef.current;
        const initial = saved ?? boot;
        const map = L.map(node, {
          center: initial
            ? [initial.lat, initial.lng]
            : [WORLD_MAP_CENTER.lat, WORLD_MAP_CENTER.lng],
          zoom: initial?.zoom ?? WORLD_ZOOM,
          zoomControl: false,
          worldCopyJump: true
        });
        if (cancelled) {
          map.remove();
          return;
        }
        if (initial) appliedBootRef.current = true;

        L.tileLayer("https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png", {
          attribution: '© <a href="https://stadiamaps.com/">Stadia Maps</a> © <a href="https://openmaptiles.org/">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 20
        }).addTo(map);

        L.control.zoom({ position: "bottomright" }).addTo(map);

        mapInstanceRef.current = map;
        setMapReady(true);
        fixSize();
        requestAnimationFrame(() => {
          fixSize();
          requestAnimationFrame(fixSize);
        });

        map.on("moveend", () => {
          const c = map.getCenter();
          writeSavedMapView(c.lat, c.lng, map.getZoom());
          emitBoundsRef.current(map);
        });

        const flyTo = (lat: number, lng: number) => {
          const zoom = map.getZoom();
          const projected = map.project([lat, lng], zoom);
          const adjusted = L.point(projected.x, projected.y + VISUAL_CENTER_OFFSET_Y_PX);
          const center = map.unproject(adjusted, zoom);
          map.flyTo(center, zoom, { duration: 0.4 });
        };
        onMapReadyRef.current?.(flyTo);

        if (initial) {
          emitBoundsNowRef.current(map);
        } else if (centerOnUserRef.current && "geolocation" in navigator) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              if (cancelled || !mapInstanceRef.current) return;
              appliedBootRef.current = true;
              map.setView([pos.coords.latitude, pos.coords.longitude], NEARBY_ZOOM, {
                animate: false
              });
              fixSize();
              emitBoundsNowRef.current(map);
            },
            () => {
              if (cancelled || !mapInstanceRef.current) return;
              emitBoundsNowRef.current(map);
            },
            { enableHighAccuracy: false, timeout: 2500, maximumAge: 120_000 }
          );
        } else {
          emitBoundsNowRef.current(map);
        }

        // Clustering is optional for first paint — attach after tiles are up.
        void import("leaflet.markercluster")
          .then(() => {
            if (cancelled || !mapInstanceRef.current || clusterGroupRef.current) return;
            const clusterGroup = L.markerClusterGroup({
              showCoverageOnHover: false,
              zoomToBoundsOnClick: true,
              spiderfyOnMaxZoom: true,
              disableClusteringAtZoom: 18,
              maxClusterRadius: 56,
              iconCreateFunction: (cluster) => {
                const count = cluster.getChildCount();
                const size = count >= 100 ? 48 : count >= 25 ? 42 : count >= 10 ? 36 : 32;
                return L.divIcon({
                  html: clusterPinHtml(count),
                  className: "bench-cluster",
                  iconSize: [size, size],
                  iconAnchor: [size / 2, size / 2]
                });
              }
            });
            clusterGroup.addTo(map);
            clusterGroupRef.current = clusterGroup;
            setClusterReady(true);
          })
          .catch((err) => {
            console.warn("markercluster unavailable; pins will attach without clustering", err);
          });
      };

      resizeObserver = new ResizeObserver(() => {
        if (!mapInstanceRef.current) tryCreate();
        else fixSize();
      });
      resizeObserver.observe(mapRef.current);
      tryCreate();
      retryTimers.push(
        window.setTimeout(tryCreate, 0),
        window.setTimeout(tryCreate, 50),
        window.setTimeout(tryCreate, 150),
        window.setTimeout(tryCreate, 400)
      );
    };

    void setupMap();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      for (const t of retryTimers) window.clearTimeout(t);
      if (boundsTimerRef.current) clearTimeout(boundsTimerRef.current);
      clusterGroupRef.current?.clearLayers();
      clusterGroupRef.current = null;
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
      markersRef.current = [];
      tempMarkerRef.current?.remove();
      tempMarkerRef.current = null;
      vpMarkerRef.current?.remove();
      vpMarkerRef.current = null;
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      if (geoWatchIDRef.current !== null && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(geoWatchIDRef.current);
        geoWatchIDRef.current = null;
      }
      appliedBootRef.current = false;
      setMapReady(false);
      setClusterReady(false);
    };
  }, [mounted]);

  // If the page resolves GPS after the map mounted on world view, snap once.
  useEffect(() => {
    if (!mapReady || !bootView || appliedBootRef.current) return;
    const map = mapInstanceRef.current;
    if (!map) return;
    appliedBootRef.current = true;
    map.setView([bootView.lat, bootView.lng], bootView.zoom, { animate: false });
    map.invalidateSize({ pan: false });
    emitBoundsNow(map);
  }, [mapReady, bootView, emitBoundsNow]);

  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || typeof window === "undefined") return;
    if (!("geolocation" in navigator)) return;

    void import("leaflet").then((L) => {
      const icon = L.default.divIcon({
        className: "bench-pin",
        html: userLocationSvg(),
        iconSize: [22, 22],
        iconAnchor: [11, 11]
      });

      geoWatchIDRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          if (!userMarkerRef.current) {
            userMarkerRef.current = L.default.marker([lat, lng], { icon, interactive: false }).addTo(mapInstanceRef.current!);
            return;
          }
          userMarkerRef.current.setLatLng([lat, lng]);
        },
        () => {},
        {
          enableHighAccuracy: true,
          maximumAge: 15000,
          timeout: 10000
        }
      );
    });

    return () => {
      if (geoWatchIDRef.current !== null && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(geoWatchIDRef.current);
        geoWatchIDRef.current = null;
      }
    };
  }, [mapReady]);

  // VP "coming soon" marker -- only when fog is on
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;

    void import("leaflet").then((L) => {
      vpMarkerRef.current?.remove();
      vpMarkerRef.current = null;

      if (enableFogOfWar) {
        const vpIcon = L.default.divIcon({
          className: "bench-pin",
          html: `<div style="
            background: rgba(45,106,79,0.92);
            color: #f7f1e8;
            padding: 8px 14px;
            border-radius: 14px;
            font-size: 11px;
            font-weight: 600;
            font-family: inherit;
            white-space: nowrap;
            text-align: center;
            line-height: 1.4;
            box-shadow: 0 4px 16px rgba(0,0,0,0.25);
            backdrop-filter: blur(4px);
          ">🔒 volunteer park<br/>coming summer 2026</div>`,
          iconSize: [160, 44],
          iconAnchor: [80, 22]
        });
        vpMarkerRef.current = L.default.marker(
          [VOLUNTEER_PARK_CENTER.lat, VOLUNTEER_PARK_CENTER.lng],
          { icon: vpIcon, interactive: false }
        ).addTo(mapInstanceRef.current!);
      }
    });
  }, [mapReady, enableFogOfWar]);

  useEffect(() => {
    if (!mounted || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    if (addMode && onMapClick) {
      const handler = (e: { latlng: { lat: number; lng: number } }) => {
        onMapClick(e.latlng.lat, e.latlng.lng);
      };
      map.on("click", handler);
      return () => {
        map.off("click", handler);
      };
    }
  }, [mounted, addMode, onMapClick]);

  useEffect(() => {
    if (!mounted || !mapInstanceRef.current) return;

    void import("leaflet").then((L) => {
      tempMarkerRef.current?.remove();
      tempMarkerRef.current = null;

      if (tempPlacement) {
        const icon = L.default.divIcon({
          className: "bench-pin",
          html: tempPinSvg(),
          iconSize: [28, 28],
          iconAnchor: [14, 28]
        });
        const marker = L.default.marker([tempPlacement.lat, tempPlacement.lng], { icon }).addTo(mapInstanceRef.current!);
        tempMarkerRef.current = marker;
      }
    });
  }, [mounted, tempPlacement]);

  useEffect(() => {
    if (!mounted || !mapInstanceRef.current) return;
    const cluster = clusterGroupRef.current;
    const map = mapInstanceRef.current;

    void import("leaflet").then((leafletMod) => {
      const L = leafletMod.default;
      const bmSet = new Set(benchmarkedBenchIDs);
      const selected = selectedBenchIDRef.current;
      const nextIds = new Set(benches.map((b) => b.id));

      // Remove markers that left the viewport set.
      markersByIdRef.current.forEach((marker, id) => {
        if (nextIds.has(id)) return;
        try {
          if (cluster) cluster.removeLayer(marker);
          else marker.remove();
        } catch {
          marker.remove();
        }
        markersByIdRef.current.delete(id);
      });

      const added: Marker[] = [];
      benches.forEach((bench) => {
        const existing = markersByIdRef.current.get(bench.id);
        if (existing) {
          const ll = existing.getLatLng();
          if (ll.lat !== bench.latitude || ll.lng !== bench.longitude) {
            existing.setLatLng([bench.latitude, bench.longitude]);
          }
          return;
        }

        const isSelected = !addMode && bench.id === selected;
        const isBenchmarked = bmSet.has(bench.id);
        const size = isSelected ? 32 : 24;
        const icon = L.divIcon({
          className: "bench-pin",
          html: benchPinSvg(isSelected, isBenchmarked),
          iconSize: [size, size],
          iconAnchor: [size / 2, size]
        });

        const marker = L.marker([bench.latitude, bench.longitude], { icon });
        marker.on("click", () => {
          const current = benchesRef.current.find((b) => b.id === bench.id) ?? bench;
          if (addMode && onMapClickRef.current) {
            onMapClickRef.current(current.latitude, current.longitude);
          } else {
            onSelectBenchRef.current(current);
          }
        });
        markersByIdRef.current.set(bench.id, marker);
        added.push(marker);
      });

      if (added.length > 0) {
        if (cluster) cluster.addLayers(added);
        else added.forEach((m) => m.addTo(map));
      }

      markersRef.current = Array.from(markersByIdRef.current.values());
    });
    // Intentionally omit selectedBenchID — selection is a cheap icon refresh below.
  }, [mounted, mapReady, clusterReady, benches, addMode, benchmarkedBenchIDs]);

  // Restyle only the previous + current selection without rebuilding the cluster.
  useEffect(() => {
    if (!mounted || !mapInstanceRef.current) return;
    void import("leaflet").then((leafletMod) => {
      const L = leafletMod.default;
      const bmSet = new Set(benchmarkedBenchIDs);
      markersByIdRef.current.forEach((marker: Marker, id: string) => {
        const isSelected = !addMode && id === selectedBenchID;
        const isBenchmarked = bmSet.has(id);
        const size = isSelected ? 32 : 24;
        marker.setIcon(
          L.divIcon({
            className: "bench-pin",
            html: benchPinSvg(isSelected, isBenchmarked),
            iconSize: [size, size],
            iconAnchor: [size / 2, size]
          })
        );
      });
    });
  }, [mounted, mapReady, selectedBenchID, addMode, benchmarkedBenchIDs]);

  // Keep a stable map container from the first client paint so Leaflet can attach immediately.
  return (
    <div className="explore-map" style={{ position: "relative", width: "100%", height: "100%", minHeight: 200 }}>
      <div
        ref={mapRef}
        style={{
          width: "100%",
          height: "100%",
          minHeight: 200,
          overflow: "hidden",
          background: "var(--elevated)"
        }}
      />
      {!mapReady ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            pointerEvents: "none",
            color: "var(--muted)"
          }}
        >
          <span className="muted" style={{ fontSize: 13 }}>
            loading map…
          </span>
        </div>
      ) : null}
      {enableFogOfWar && mapReady && mapInstanceRef.current && (
        <FogOverlay
          mapInstance={mapInstanceRef.current}
          greenLakeCenter={GREEN_LAKE_CENTER}
        />
      )}
    </div>
  );
}
