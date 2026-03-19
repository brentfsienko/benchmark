"use client";

import { useEffect, useRef, useState } from "react";
import type { Map, Marker } from "leaflet";
import type { Bench } from "@/src/lib/types";

const VOLUNTEER_PARK_CENTER = { lat: 47.6298, lng: -122.3142 } as const;
const DEFAULT_ZOOM = 16;

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
          html: `<div style="
            width:28px;
            height:28px;
            border-radius:50%;
            background:#2d6a4f;
            border:2px solid #23201b;
            display:grid;
            place-items:center;
            font-size:14px;
            box-shadow:0 2px 8px rgba(0,0,0,0.2);
          ">📍</div>`,
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
        const icon = L.default.divIcon({
          className: "bench-pin",
          html: `<div style="
            width:${isSelected ? 32 : 24}px;
            height:${isSelected ? 32 : 24}px;
            border-radius:50%;
            background:${isSelected ? "#2d6a4f" : "#f7f1e8"};
            border:2px solid ${isSelected ? "#23201b" : "#dacfbf"};
            display:grid;
            place-items:center;
            font-size:12px;
            padding-top:2px;
            box-shadow:0 2px 8px rgba(0,0,0,0.12);
          ">📍</div>`,
          iconSize: [isSelected ? 32 : 24, isSelected ? 32 : 24],
          iconAnchor: [isSelected ? 16 : 12, isSelected ? 32 : 24]
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
