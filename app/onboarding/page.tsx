"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/src/contexts/auth-context";
import { completeOnboarding } from "@/src/lib/api";
import { trackEvent } from "@/src/lib/analytics";

const ONBOARDING_KEY = "benchmark_onboarding_complete";

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
  const slide = slides[step];

  const finish = (eventName: "onboarding_complete" | "onboarding_skipped") => {
    if (typeof window !== "undefined") {
      localStorage.setItem(ONBOARDING_KEY, "true");
    }
    trackEvent({ name: eventName });
    completeOnboarding(profileId ?? "user-1").catch(() => {});
    router.replace("/explore");
  };

  const handleNext = () => {
    if (step < slides.length - 1) {
      setStep((s) => s + 1);
    } else {
      finish("onboarding_complete");
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--page)",
        display: "flex",
        flexDirection: "column",
        padding: "max(env(safe-area-inset-top), 24px) 24px max(env(safe-area-inset-bottom), 24px)"
      }}
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
              priority={step === 1}
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

      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 8 }}>
        {slides.map((_, i) => (
          <div
            key={i}
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              background: i === step ? "var(--accent)" : "var(--border)"
            }}
          />
        ))}
      </div>

      <button
        type="button"
        className="button-primary"
        onClick={handleNext}
        style={{ width: "100%", height: 48, fontSize: 16 }}
      >
        {step < slides.length - 1 ? "next" : "get started"}
      </button>
    </div>
  );
}
