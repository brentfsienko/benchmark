"use client";

import { useEffect, useMemo, type CSSProperties } from "react";

type PhotoLightboxProps = {
  photos: string[];
  src: string | null;
  onClose: () => void;
  onChange: (src: string) => void;
  alt?: string;
};

function Chevron({ dir }: { dir: "prev" | "next" }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d={dir === "prev" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"}
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PhotoLightbox({
  photos,
  src,
  onClose,
  onChange,
  alt = "Full view"
}: PhotoLightboxProps) {
  const index = useMemo(() => (src ? photos.indexOf(src) : -1), [photos, src]);
  const canCycle = photos.length > 1 && index >= 0;

  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => {
      if (!canCycle) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        onChange(photos[(index - 1 + photos.length) % photos.length]);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        onChange(photos[(index + 1) % photos.length]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [src, canCycle, index, photos, onChange, onClose]);

  if (!src) return null;

  const go = (delta: number) => {
    if (!canCycle) return;
    onChange(photos[(index + delta + photos.length) % photos.length]);
  };

  const arrowStyle: CSSProperties = {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    width: 36,
    height: 36,
    borderRadius: "50%",
    border: "1px solid rgba(255,255,255,0.28)",
    background: "rgba(0,0,0,0.45)",
    color: "#fff",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    padding: 0,
    zIndex: 1,
    backdropFilter: "blur(4px)"
  };

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 120,
        background: "rgba(0,0,0,0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        cursor: "pointer"
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          maxWidth: "100%",
          maxHeight: "90vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        {canCycle ? (
          <button
            type="button"
            aria-label="Previous photo"
            onClick={() => go(-1)}
            style={{ ...arrowStyle, left: 8 }}
          >
            <Chevron dir="prev" />
          </button>
        ) : null}
        <img
          src={src}
          alt={alt}
          style={{
            maxWidth: "100%",
            maxHeight: "90vh",
            borderRadius: "var(--radius)",
            objectFit: "contain",
            display: "block",
            cursor: "default"
          }}
        />
        {canCycle ? (
          <button
            type="button"
            aria-label="Next photo"
            onClick={() => go(1)}
            style={{ ...arrowStyle, right: 8 }}
          >
            <Chevron dir="next" />
          </button>
        ) : null}
        {canCycle ? (
          <span
            style={{
              position: "absolute",
              bottom: 10,
              left: "50%",
              transform: "translateX(-50%)",
              fontSize: 12,
              fontWeight: 600,
              color: "rgba(255,255,255,0.85)",
              background: "rgba(0,0,0,0.45)",
              borderRadius: 999,
              padding: "3px 10px",
              pointerEvents: "none"
            }}
          >
            {index + 1} / {photos.length}
          </span>
        ) : null}
      </div>
    </div>
  );
}
