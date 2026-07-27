"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

type PhotoLightboxProps = {
  photos: string[];
  src: string | null;
  onClose: () => void;
  onChange: (src: string) => void;
  alt?: string;
};

function Chevron({ dir }: { dir: "prev" | "next" }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
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

export function PhotoLightbox({
  photos,
  src,
  onClose,
  onChange,
  alt = "Full view"
}: PhotoLightboxProps) {
  const [mounted, setMounted] = useState(false);
  const index = useMemo(() => (src ? photos.indexOf(src) : -1), [photos, src]);
  const canCycle = photos.length > 1 && index >= 0;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!src) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
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
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [src, canCycle, index, photos, onChange, onClose]);

  if (!src || !mounted) return null;

  const go = (delta: number) => {
    if (!canCycle) return;
    onChange(photos[(index + delta + photos.length) % photos.length]);
  };

  const arrowBtn: CSSProperties = {
    width: 48,
    height: 48,
    borderRadius: "50%",
    border: "1px solid rgba(255,255,255,0.32)",
    background: "rgba(0,0,0,0.55)",
    color: "#fff",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    padding: 0,
    pointerEvents: "auto",
    touchAction: "manipulation",
    backdropFilter: "blur(6px)",
    WebkitTapHighlightColor: "transparent"
  };

  return createPortal(
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 400,
        background: "rgba(0,0,0,0.88)",
        display: "flex",
        flexDirection: "column",
        // Leave room for bottom nav so controls stay above it.
        paddingBottom: "calc(var(--nav-height) + var(--safe-bottom))",
        cursor: "pointer",
        pointerEvents: "auto"
      }}
    >
      <button
        type="button"
        aria-label="Close photo"
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
          pointerEvents: "auto",
          touchAction: "manipulation",
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
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "56px 16px 72px",
          position: "relative",
          cursor: "default",
          pointerEvents: "auto"
        }}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            borderRadius: "var(--radius)",
            objectFit: "contain",
            display: "block",
            pointerEvents: "none",
            userSelect: "none"
          }}
        />

        {canCycle ? (
          <div
            style={{
              position: "absolute",
              left: "50%",
              bottom: 12,
              transform: "translateX(-50%)",
              display: "flex",
              alignItems: "center",
              gap: 18,
              zIndex: 3,
              pointerEvents: "auto"
            }}
          >
            <button
              type="button"
              aria-label="Previous photo"
              onClick={(e) => {
                e.stopPropagation();
                go(-1);
              }}
              style={arrowBtn}
            >
              <Chevron dir="prev" />
            </button>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "rgba(255,255,255,0.9)",
                background: "rgba(0,0,0,0.5)",
                borderRadius: 999,
                padding: "6px 12px",
                minWidth: 52,
                textAlign: "center",
                pointerEvents: "none",
                backdropFilter: "blur(4px)"
              }}
            >
              {index + 1} / {photos.length}
            </span>
            <button
              type="button"
              aria-label="Next photo"
              onClick={(e) => {
                e.stopPropagation();
                go(1);
              }}
              style={arrowBtn}
            >
              <Chevron dir="next" />
            </button>
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
