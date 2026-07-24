"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, type TouchEvent } from "react";
import { useAuth } from "@/src/contexts/auth-context";
import { completeOnboarding } from "@/src/lib/api";
import { trackEvent } from "@/src/lib/analytics";
import { markOnboardingComplete } from "@/src/lib/onboarding";

type Slide =
  | {
      title: string;
      body: string;
      visual: "icon";
    }
  | {
      title: string;
      body: string;
      visual: "screenshot";
      src: string;
      alt: string;
    };

const slides: Slide[] = [
  {
    title: "discover benches",
    body: "find the best park benches near you. explore the map and tap pins to see details.",
    visual: "icon"
  },
  {
    title: "search the map",
    body: "pan around your neighborhood, browse nearby pins, and swipe the carousel to preview benches before you go.",
    visual: "screenshot",
    src: "/onboarding/search.jpg",
    alt: "map explore screen with bench pins and carousel"
  },
  {
    title: "add a bench",
    body: "found a seat that isn't on the map? drop a pin, name it, and share it with the community.",
    visual: "screenshot",
    src: "/onboarding/add.jpg",
    alt: "add bench form over the map"
  }
];

export default function OnboardingPage() {
  const router = useRouter();
  const { profileId } = useAuth();
  const [step, setStep] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const slide = slides[step];

  const finish = useCallback(
    (eventName: "onboarding_complete" | "onboarding_skipped") => {
      markOnboardingComplete();
      trackEvent({ name: eventName });
      completeOnboarding(profileId ?? "user-1").catch(() => {});
      router.replace("/explore");
    },
    [profileId, router]
  );

  const goNext = useCallback(() => {
    if (step < slides.length - 1) {
      setStep((s) => s + 1);
      return;
    }
    finish("onboarding_complete");
  }, [finish, step]);

  const goPrev = useCallback(() => {
    if (step > 0) setStep((s) => s - 1);
  }, [step]);

  const onTouchStart = (e: TouchEvent) => {
    touchStartX.current = e.changedTouches[0]?.clientX ?? null;
  };

  const onTouchEnd = (e: TouchEvent) => {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start == null) return;
    const end = e.changedTouches[0]?.clientX ?? start;
    const delta = end - start;
    if (Math.abs(delta) < 48) return;
    if (delta < 0) goNext();
    else goPrev();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "var(--page)",
        display: "flex",
        flexDirection: "column",
        padding: "max(env(safe-area-inset-top), 24px) 24px max(env(safe-area-inset-bottom), 24px)"
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <button
        type="button"
        onClick={() => finish("onboarding_skipped")}
        style={{
          alignSelf: "flex-end",
          padding: "8px 12px",
          fontSize: 13,
          color: "var(--text-secondary)",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit"
        }}
      >
        skip
      </button>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 28,
          minHeight: 0
        }}
      >
        {slide.visual === "icon" ? (
          <div
            style={{
              width: 120,
              height: 120,
              borderRadius: 28,
              overflow: "hidden",
              boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
              flexShrink: 0
            }}
          >
            <Image
              src="/app-icon.png"
              alt="benchmark"
              width={120}
              height={120}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              priority
            />
          </div>
        ) : (
          <div
            style={{
              width: "min(100%, 280px)",
              aspectRatio: "3 / 4",
              maxHeight: "min(48vh, 360px)",
              borderRadius: 20,
              overflow: "hidden",
              boxShadow: "0 12px 40px rgba(0,0,0,0.14)",
              border: "1px solid var(--border)",
              background: "var(--elevated)",
              flexShrink: 1,
              position: "relative"
            }}
          >
            <Image
              src={slide.src}
              alt={slide.alt}
              fill
              sizes="280px"
              style={{ objectFit: "cover", objectPosition: "top center" }}
              priority
            />
          </div>
        )}
        <div style={{ textAlign: "center", maxWidth: 320, flexShrink: 0 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 700,
              textTransform: "lowercase",
              color: "var(--text-primary)"
            }}
          >
            {slide.title}
          </h1>
          <p
            className="muted"
            style={{
              margin: "12px 0 0",
              fontSize: 15,
              lineHeight: 1.5,
              color: "var(--text-secondary)"
            }}
          >
            {slide.body}
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16 }}>
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Go to slide ${i + 1}`}
            onClick={() => setStep(i)}
            style={{
              width: i === step ? 18 : 8,
              height: 8,
              borderRadius: 4,
              border: "none",
              padding: 0,
              background: i === step ? "var(--accent)" : "var(--border)",
              cursor: "pointer",
              transition: "width 0.2s ease, background 0.2s ease"
            }}
          />
        ))}
      </div>

      <button
        type="button"
        className="button-primary"
        onClick={goNext}
        style={{ width: "100%", height: 48, fontSize: 16, flexShrink: 0 }}
      >
        {step < slides.length - 1 ? "next" : "get started"}
      </button>
    </div>
  );
}
