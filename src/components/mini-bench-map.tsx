"use client";

import { useEffect, useRef, useState } from "react";
import type { Map, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";

type MiniBenchMapProps = {
  latitude: number;
  longitude: number;
  markerLabel?: string;
  /** Hide zoom controls (feed cards). */
  interactive?: boolean;
};

function benchPinSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" fill="#2d6a4f" stroke="#23201b" stroke-width="2"/>
    <circle cx="12" cy="12" r="3.5" fill="#f7f1e8"/>
  </svg>`;
}

export function MiniBenchMap({
  latitude,
  longitude,
  markerLabel,
  interactive = true
}: MiniBenchMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !containerRef.current || typeof window === "undefined") return;

    void import("leaflet").then((L) => {
      const proto = L.default.Icon.Default.prototype;
      if ("_getIconUrl" in proto) {
        delete (proto as unknown as Record<string, unknown>)["_getIconUrl"];
      }

      const map = L.default.map(containerRef.current!, {
        center: [latitude, longitude],
        zoom: 16,
        zoomControl: false,
        attributionControl: false,
        dragging: interactive,
        scrollWheelZoom: interactive,
        doubleClickZoom: interactive,
        boxZoom: interactive,
        keyboard: interactive,
        touchZoom: interactive
      });

      if (interactive) {
        L.default.control.zoom({ position: "bottomright" }).addTo(map);
      }

      L.default.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd",
        maxZoom: 20
      }).addTo(map);

      const icon = L.default.divIcon({
        className: "bench-pin",
        html: benchPinSvg(),
        iconSize: [26, 26],
        iconAnchor: [13, 26]
      });
      const marker = L.default.marker([latitude, longitude], { icon }).addTo(map);
      if (markerLabel) marker.bindTooltip(markerLabel, { direction: "top", offset: [0, -24] });

      mapRef.current = map;
      markerRef.current = marker;

      // Modal / late-layout containers need a size pass after paint.
      requestAnimationFrame(() => {
        map.invalidateSize({ pan: false });
        setTimeout(() => map.invalidateSize({ pan: false }), 120);
      });
    });

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [mounted, latitude, longitude, markerLabel, interactive]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        minHeight: 0,
        pointerEvents: interactive ? "auto" : "none"
      }}
      aria-label="bench location map"
    />
  );
}
