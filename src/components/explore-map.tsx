"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Map, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { BenchPin } from "@/src/lib/types";
import { FogOverlay } from "./fog-overlay";

export type ViewportBounds = {
  sw_lat: number;
  sw_lng: number;
  ne_lat: number;
  ne_lng: number;
};

const GREEN_LAKE_CENTER = { lat: 47.6798, lng: -122.3288 } as const;
const VOLUNTEER_PARK_CENTER = { lat: 47.6298, lng: -122.3142 } as const;
const DEFAULT_ZOOM = 14;

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
  centerOnUserOnLoad = true
}: ExploreMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const tempMarkerRef = useRef<Marker | null>(null);
  const vpMarkerRef = useRef<Marker | null>(null);
  const userMarkerRef = useRef<Marker | null>(null);
  const geoWatchIDRef = useRef<number | null>(null);
  const boundsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onBoundsChangeRef = useRef(onBoundsChange);
  onBoundsChangeRef.current = onBoundsChange;
  const [mounted, setMounted] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  const emitBounds = useCallback((map: Map) => {
    if (boundsTimerRef.current) clearTimeout(boundsTimerRef.current);
    boundsTimerRef.current = setTimeout(() => {
      const b = map.getBounds();
      onBoundsChangeRef.current?.({
        sw_lat: b.getSouthWest().lat,
        sw_lng: b.getSouthWest().lng,
        ne_lat: b.getNorthEast().lat,
        ne_lng: b.getNorthEast().lng,
      });
    }, 300);
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !mapRef.current || typeof window === "undefined") return;

    void import("leaflet").then((L) => {
      const proto = L.default.Icon.Default.prototype;
      if ("_getIconUrl" in proto) {
        delete (proto as unknown as Record<string, unknown>)["_getIconUrl"];
      }
      L.default.Icon.Default.mergeOptions({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png"
      });

      const map = L.default.map(mapRef.current!, {
        center: [GREEN_LAKE_CENTER.lat, GREEN_LAKE_CENTER.lng],
        zoom: DEFAULT_ZOOM,
        zoomControl: false
      });

      L.default.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: "© OSM © CARTO",
        subdomains: "abcd",
        maxZoom: 20
      }).addTo(map);

      L.default.control.zoom({ position: "bottomright" }).addTo(map);

      mapInstanceRef.current = map;
      setMapReady(true);

      emitBounds(map);
      map.on("moveend", () => emitBounds(map));

      const flyTo = (lat: number, lng: number) => {
        map.flyTo([lat, lng], 16, { duration: 0.35 });
      };
      onMapReady?.(flyTo);

      if (centerOnUserOnLoad && "geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (!mapInstanceRef.current) return;
            map.setView([pos.coords.latitude, pos.coords.longitude], 15, { animate: false });
            emitBounds(map);
          },
          () => {
            // Keep Green Lake fallback if permission denied / timeout.
          },
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 }
        );
      }
    });

    return () => {
      if (boundsTimerRef.current) clearTimeout(boundsTimerRef.current);
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
      markersRef.current = [];
      tempMarkerRef.current?.remove();
      tempMarkerRef.current = null;
      vpMarkerRef.current?.remove();
      vpMarkerRef.current = null;
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      if (geoWatchIDRef.current !== null && typeof window !== "undefined" && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(geoWatchIDRef.current);
        geoWatchIDRef.current = null;
      }
      setMapReady(false);
    };
  }, [mounted, onMapReady, emitBounds, centerOnUserOnLoad]);

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

    void import("leaflet").then((L) => {
      const map = mapInstanceRef.current!;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      const bmSet = new Set(benchmarkedBenchIDs);

      benches.forEach((bench) => {
        const isSelected = !addMode && bench.id === selectedBenchID;
        const isBenchmarked = bmSet.has(bench.id);
        const size = isSelected ? 32 : 24;
        const icon = L.default.divIcon({
          className: "bench-pin",
          html: benchPinSvg(isSelected, isBenchmarked),
          iconSize: [size, size],
          iconAnchor: [size / 2, size]
        });

        const marker = L.default.marker([bench.latitude, bench.longitude], { icon }).addTo(map);
        marker.on("click", () => {
          if (addMode && onMapClick) {
            onMapClick(bench.latitude, bench.longitude);
          } else {
            onSelectBench(bench);
          }
        });
        markersRef.current.push(marker);
      });
    });
  }, [mounted, benches, selectedBenchID, onSelectBench, addMode, onMapClick, benchmarkedBenchIDs]);

  if (!mounted) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          minHeight: 200,
          background: "var(--elevated)",
          display: "grid",
          placeItems: "center"
        }}
      >
        <span className="muted">loading map…</span>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 200 }}>
      <div
        ref={mapRef}
        style={{
          width: "100%",
          height: "100%",
          minHeight: 200,
          overflow: "hidden"
        }}
      />
      {enableFogOfWar && mapReady && mapInstanceRef.current && (
        <FogOverlay
          mapInstance={mapInstanceRef.current}
          greenLakeCenter={GREEN_LAKE_CENTER}
        />
      )}
    </div>
  );
}
