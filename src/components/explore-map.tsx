"use client";

import { useEffect, useRef, useState } from "react";
import type { Map, Marker } from "leaflet";
import type { Bench } from "@/src/lib/types";

const VOLUNTEER_PARK_CENTER = { lat: 47.6298, lng: -122.3142 } as const;
const DEFAULT_ZOOM = 16;

function benchPinSvg(selected: boolean): string {
  const size = selected ? 32 : 24;
  const fill = selected ? "#2d6a4f" : "#f7f1e8";
  const stroke = selected ? "#23201b" : "#dacfbf";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
    <circle cx="12" cy="12" r="3.5" fill="${selected ? "#f7f1e8" : "#2d6a4f"}"/>
  </svg>`;
}

function tempPinSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" fill="#2d6a4f" stroke="#23201b" stroke-width="2"/>
    <line x1="12" y1="7" x2="12" y2="17" stroke="#f7f1e8" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="7" y1="12" x2="17" y2="12" stroke="#f7f1e8" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`;
}

type ExploreMapProps = {
  benches: Bench[];
  selectedBenchID: string | null;
  onSelectBench: (bench: Bench) => void;
  onMapReady?: (flyTo: (lat: number, lng: number) => void) => void;
  addMode?: boolean;
  tempPlacement?: { lat: number; lng: number } | null;
  onMapClick?: (lat: number, lng: number) => void;
};

export function ExploreMap({
  benches,
  selectedBenchID,
  onSelectBench,
  onMapReady,
  addMode = false,
  tempPlacement = null,
  onMapClick
}: ExploreMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const tempMarkerRef = useRef<Marker | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !mapRef.current || typeof window === "undefined") return;

    void import("leaflet").then((L) => {
      // Fix Leaflet default icon paths broken by bundlers
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
        center: [VOLUNTEER_PARK_CENTER.lat, VOLUNTEER_PARK_CENTER.lng],
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

      const flyTo = (lat: number, lng: number) => {
        map.flyTo([lat, lng], 16, { duration: 0.35 });
      };
      onMapReady?.(flyTo);
    });

    return () => {
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
      markersRef.current = [];
      tempMarkerRef.current?.remove();
      tempMarkerRef.current = null;
    };
  }, [mounted, onMapReady]);

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

      benches.forEach((bench) => {
        const isSelected = !addMode && bench.id === selectedBenchID;
        const size = isSelected ? 32 : 24;
        const icon = L.default.divIcon({
          className: "bench-pin",
          html: benchPinSvg(isSelected),
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
  }, [mounted, benches, selectedBenchID, onSelectBench, addMode, onMapClick]);

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
    <div
      ref={mapRef}
      style={{
        width: "100%",
        height: "100%",
        minHeight: 200,
        overflow: "hidden"
      }}
    />
  );
}
