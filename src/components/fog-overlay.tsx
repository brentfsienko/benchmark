"use client";

import { useEffect, useRef, useState } from "react";

type FogOverlayProps = {
  mapInstance: unknown;
  greenLakeCenter: { lat: number; lng: number };
};

export function FogOverlay({ mapInstance, greenLakeCenter }: FogOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [hole, setHole] = useState({ x: 0, y: 0, r: 180 });

  useEffect(() => {
    if (!mapInstance) return;

    const map = mapInstance as {
      latLngToContainerPoint: (latlng: [number, number]) => { x: number; y: number };
      getZoom: () => number;
      on: (event: string, fn: () => void) => void;
      off: (event: string, fn: () => void) => void;
    };

    const update = () => {
      const pt = map.latLngToContainerPoint([greenLakeCenter.lat, greenLakeCenter.lng]);
      const zoom = map.getZoom();
      const baseR = 140;
      const r = baseR * Math.pow(2, zoom - 14);
      setHole({ x: pt.x, y: pt.y, r });
    };

    update();
    map.on("move", update);
    map.on("zoom", update);
    return () => {
      map.off("move", update);
      map.off("zoom", update);
    };
  }, [mapInstance, greenLakeCenter]);

  const maskStyle = `radial-gradient(ellipse ${hole.r * 1.3}px ${hole.r}px at ${hole.x}px ${hole.y}px, transparent 60%, rgba(0,0,0,0.3) 75%, rgba(0,0,0,1) 100%)`;

  return (
    <div
      ref={overlayRef}
      className="fog-overlay-container"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 2,
        overflow: "hidden",
        maskImage: maskStyle,
        WebkitMaskImage: maskStyle
      }}
    >
      {/* Cloud layer 1 - large slow clouds */}
      <div className="fog-cloud-layer fog-layer-1" />
      {/* Cloud layer 2 - medium clouds, different speed */}
      <div className="fog-cloud-layer fog-layer-2" />
      {/* Cloud layer 3 - wispy top layer */}
      <div className="fog-cloud-layer fog-layer-3" />

      {/* SVG filter for organic turbulence texture */}
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <defs>
          <filter id="cloud-turbulence">
            <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves={4} seed={2} result="noise" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0.94  0 0 0 0 0.91  0 0 0 0 0.87  0 0 0 0.65 0"
              in="noise"
              result="colored"
            />
          </filter>
          <filter id="cloud-turbulence-2">
            <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves={3} seed={7} result="noise" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0.96  0 0 0 0 0.93  0 0 0 0 0.89  0 0 0 0.5 0"
              in="noise"
              result="colored"
            />
          </filter>
        </defs>
      </svg>
    </div>
  );
}
