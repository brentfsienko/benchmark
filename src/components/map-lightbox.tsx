"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MiniBenchMap } from "@/src/components/mini-bench-map";

type MapLightboxProps = {
  open: boolean;
  latitude: number;
  longitude: number;
  label?: string;
  onClose: () => void;
};

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MapLightbox({ open, latitude, longitude, label, onClose }: MapLightboxProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Bench location map"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 400,
        background: "rgba(0,0,0,0.72)",
        display: "flex",
        flexDirection: "column",
        paddingBottom: "calc(var(--nav-height) + var(--safe-bottom))",
        cursor: "pointer"
      }}
    >
      <button
        type="button"
        aria-label="Close map"
        title="Close"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        style={{
          position: "absolute",
          top: "max(12px, env(safe-area-inset-top, 0px))",
          left: "max(12px, env(safe-area-inset-left, 0px))",
          width: 44,
          height: 44,
          borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.28)",
          background: "rgba(0,0,0,0.55)",
          color: "#fff",
          display: "grid",
          placeItems: "center",
          cursor: "pointer",
          padding: 0,
          zIndex: 2,
          backdropFilter: "blur(4px)"
        }}
      >
        <CloseIcon />
      </button>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          flex: 1,
          minHeight: 0,
          margin: "56px 12px 16px",
          borderRadius: 16,
          overflow: "hidden",
          background: "var(--elevated)",
          border: "1px solid rgba(255,255,255,0.12)",
          cursor: "default",
          position: "relative"
        }}
      >
        <MiniBenchMap
          latitude={latitude}
          longitude={longitude}
          markerLabel={label}
          interactive
        />
        {label ? (
          <div
            style={{
              position: "absolute",
              left: 12,
              right: 12,
              bottom: 12,
              pointerEvents: "none",
              background: "rgba(35,32,27,0.78)",
              color: "#f7f1e8",
              borderRadius: 10,
              padding: "8px 12px",
              fontSize: 13,
              fontWeight: 600,
              backdropFilter: "blur(6px)"
            }}
          >
            {label}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
