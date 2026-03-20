"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { createBench, getProfile, listNearbyBenches, updateBenchLocation } from "@/src/lib/api";
import type { Bench } from "@/src/lib/types";
import { BenchmarkLogo } from "@/src/components/benchmark-logo";
import { ExploreMap } from "@/src/components/explore-map";
import { trackEvent } from "@/src/lib/analytics";
import { useAuth } from "@/src/contexts/auth-context";

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

type ExploreFilters = {
  minRating?: number;
  types?: string[];
};

const BENCH_TYPE_LABELS: Record<string, string> = {
  park: "park",
  wooden: "wooden",
  stone: "stone",
  modern: "modern",
  memorial: "memorial"
};

export default function ExplorePage() {
  const { isAdmin, profileId } = useAuth();
  const [benches, setBenches] = useState<Bench[]>([]);
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
  const [addType, setAddType] = useState("park");
  const [addDescription, setAddDescription] = useState("");
  const flyToRef = useRef<(lat: number, lng: number) => void>(() => {});
  const carouselRef = useRef<HTMLDivElement>(null);
  const selectedCardRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async (nextFilters: ExploreFilters) => {
    setLoading(true);
    setError(null);
    try {
      const data = await listNearbyBenches({
        lat: 47.6798,
        lng: -122.3288,
        minRating: nextFilters.minRating,
        radiusMeters: 3000
      });
      const filtered = nextFilters.types && nextFilters.types.length > 0
        ? data.filter((b) => nextFilters.types!.includes(b.type))
        : data;
      setBenches(filtered);
      setSelectedBenchID((prev) => {
        if (prev && filtered.some((b) => b.id === prev)) return prev;
        return filtered.length > 0 ? filtered[0].id : null;
      });
      trackEvent({
        name: "explore_loaded",
        metadata: { count: filtered.length, types: nextFilters.types?.length ?? 0, hasMinRating: Boolean(nextFilters.minRating) }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "unable to load benches");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh(filters).catch(() => {});
  }, [filters, refresh]);

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

  useEffect(() => {
    if (profileId) {
      getProfile(profileId)
        .then((p) => setBenchmarkedIDs(p.benchmarkedBenchIDs))
        .catch(() => {});
    }
  }, [profileId]);

  useEffect(() => {
    if (benches.length > 0 && !selectedBenchID) {
      setSelectedBenchID(benches[0].id);
    }
  }, [benches, selectedBenchID]);

  const hasFilters = Boolean(filters.minRating || (filters.types && filters.types.length > 0));
  const selectedBench = benches.find((b) => b.id === selectedBenchID);

  const handleSelectFromMap = useCallback((bench: Bench) => {
    setSelectedBenchID(bench.id);
    flyToRef.current(bench.latitude, bench.longitude);
    setTimeout(() => {
      selectedCardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }, 100);
  }, []);

  const handleSelectFromCard = useCallback((bench: Bench) => {
    setSelectedBenchID(bench.id);
    flyToRef.current(bench.latitude, bench.longitude);
  }, []);

  const handleMapReady = useCallback((flyTo: (lat: number, lng: number) => void) => {
    flyToRef.current = flyTo;
  }, []);

  const handleMapClick = useCallback((lat: number, lng: number) => {
    setTempPlacement({ lat, lng });
  }, []);

  const handlePlusClick = useCallback(() => {
    setAddMode(true);
    setMoveMode(false);
    setTempPlacement(null);
  }, []);

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

  const handleConfirmMove = useCallback(async () => {
    if (!tempPlacement || !selectedBenchID) return;
    try {
      const updated = await updateBenchLocation(selectedBenchID, tempPlacement.lat, tempPlacement.lng);
      setAddStatus(`moved ${updated.name}`);
      trackEvent({ name: "bench_moved", benchId: selectedBenchID });
      await refresh(filters);
      setTimeout(() => {
        setAddMode(false);
        setMoveMode(false);
        setTempPlacement(null);
        setAddStatus(null);
      }, 1200);
    } catch (err) {
      setAddStatus(err instanceof Error ? err.message : "unable to move bench");
    }
  }, [tempPlacement, selectedBenchID, refresh, filters]);

  const handleAddSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!tempPlacement) return;
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
        setAddStatus(`created ${created.name}`);
        trackEvent({ name: "bench_created", benchId: created.id });
        refresh(filters).catch(() => {});
        setTimeout(() => {
          handleCancelAdd();
          setAddStatus(null);
        }, 1500);
      } catch (err) {
        setAddStatus(err instanceof Error ? err.message : "unable to add bench");
      }
    },
    [tempPlacement, addName, addNeighborhood, addType, addDescription, filters, refresh, handleCancelAdd]
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
          addMode={addMode || moveMode}
          tempPlacement={tempPlacement}
          onMapClick={handleMapClick}
          benchmarkedBenchIDs={benchmarkedIDs}
          enableFogOfWar={false}
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
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <BenchmarkLogo size={32} />
          <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 6, justifyContent: "flex-end" }}>
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
                transition: "all 0.2s"
              }}
            >
              filters{hasFilters ? " ●" : ""}
            </button>
          </div>
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
              {Object.entries(BENCH_TYPE_LABELS).map(([value, label]) => {
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
              showing {benches.length} bench{benches.length !== 1 ? "es" : ""}
            </p>
          </div>
        )}
      </header>

      {/* Add-mode floating buttons */}
      <div
        style={{
          position: "absolute",
          right: 16,
          bottom: 120,
          zIndex: 3,
          display: "flex",
          gap: 8,
          alignItems: "center"
        }}
      >
        {!addMode && !moveMode ? (
          isAdmin && (
            <>
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
              <button
                type="button"
                className="button-primary"
                onClick={handlePlusClick}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
                }}
                aria-label="Add bench"
              >
                <PlusIcon />
              </button>
            </>
          )
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
              onClick={() => refresh(filters)}
            >
              retry
            </button>
          </div>
        ) : benches.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>no benches nearby</p>
        ) : (
          <div
            ref={carouselRef}
            className="explore-carousel"
            style={{
              display: "flex",
              gap: 10,
              overflowX: "auto",
              paddingBottom: 4,
              scrollSnapType: "x mandatory"
            }}
          >
            {benches.map((bench) => {
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
                    width: 168,
                    padding: 12,
                    borderRadius: "var(--radius)",
                    background: isSelected ? "var(--surface)" : "rgba(247,241,232,0.95)",
                    border: `1.5px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
                    boxShadow: isSelected ? "0 4px 16px rgba(0,0,0,0.08)" : "0 2px 8px rgba(0,0,0,0.04)",
                    scrollSnapAlign: "center",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4
                  }}
                >
                  <p style={{ margin: 0, fontWeight: isSelected ? 700 : 600, fontSize: 14 }}>{bench.name}</p>
                  <p className="muted" style={{ margin: 0, fontSize: 11 }}>
                    {bench.neighborhood} • {bench.averageRating.toFixed(1)}★
                  </p>
                  <Link
                    href={`/bench/${bench.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      trackEvent({ name: "bench_opened_from_explore", benchId: bench.id });
                    }}
                    style={{
                      marginTop: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--accent)",
                      textDecoration: "none"
                    }}
                  >
                    open →
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add bench form modal */}
      {showAddForm && tempPlacement && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center"
          }}
          onClick={handleCancelAdd}
        >
          <div
            className="surface-card"
            style={{
              width: "100%",
              maxWidth: 420,
              maxHeight: "85vh",
              overflowY: "auto",
              padding: 20,
              borderTopLeftRadius: "var(--radius-lg, 16px)",
              borderTopRightRadius: "var(--radius-lg, 16px)",
              boxShadow: "0 -4px 24px rgba(0,0,0,0.15)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: "0 0 8px", fontSize: 18, textTransform: "lowercase" }}>add a bench</h2>
            <p className="muted" style={{ margin: "0 0 16px", fontSize: 13 }}>
              pin placed at {tempPlacement.lat.toFixed(5)}, {tempPlacement.lng.toFixed(5)}
            </p>
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
                <input value={addType} onChange={(e) => setAddType(e.target.value)} style={{ width: "100%", marginTop: 4 }} />
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
              <button type="submit" className="button-primary">
                confirm bench
              </button>
            </form>
            {addStatus && <p style={{ margin: "12px 0 0", color: "var(--accent)", fontSize: 13 }}>{addStatus}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
