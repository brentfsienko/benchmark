"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
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
    alt: "explore map with bench pins and carousel cards"
  },
  {
    title: "leave a benchmark",
    body: "when you sit down, rate the bench, add a note or photo, and help the community find the best seats.",
    visual: "icon"
  }
];

function SlideVisual({ slide }: { slide: Slide }) {
  if (slide.visual === "icon") {
    return (
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
    );
  }

  return (
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
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const { profileId } = useAuth();
  const [step, setStep] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const ignoreScrollRef = useRef(false);

  const finish = useCallback(
    (eventName: "onboarding_complete" | "onboarding_skipped") => {
      markOnboardingComplete();
      trackEvent({ name: eventName });
      completeOnboarding(profileId ?? "user-1").catch(() => {});
      router.replace("/explore");
    },
    [profileId, router]
  );

  const scrollToStep = useCallback((index: number, behavior: ScrollBehavior = "smooth") => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const width = scroller.clientWidth;
    ignoreScrollRef.current = true;
    scroller.scrollTo({ left: width * index, behavior });
    setStep(index);
    window.setTimeout(() => {
      ignoreScrollRef.current = false;
    }, behavior === "smooth" ? 350 : 0);
  }, []);

  const goNext = useCallback(() => {
    if (step < slides.length - 1) {
      scrollToStep(step + 1);
      return;
    }
    finish("onboarding_complete");
  }, [finish, scrollToStep, step]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const syncStep = () => {
      if (ignoreScrollRef.current) return;
      const width = scroller.clientWidth || 1;
      const next = Math.round(scroller.scrollLeft / width);
      setStep(Math.max(0, Math.min(slides.length - 1, next)));
    };

    scroller.addEventListener("scroll", syncStep, { passive: true });
    window.addEventListener("resize", syncStep);
    return () => {
      scroller.removeEventListener("scroll", syncStep);
      window.removeEventListener("resize", syncStep);
    };
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "var(--page)",
        display: "flex",
        flexDirection: "column",
        padding: "max(env(safe-area-inset-top), 24px) 0 max(env(safe-area-inset-bottom), 24px)"
      }}
    >
      <div style={{ padding: "0 24px", display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={() => finish("onboarding_skipped")}
          style={{
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
      </div>

      <div
        ref={scrollerRef}
        className="onboarding-scroller"
        style={{
          flex: 1,
          display: "flex",
          overflowX: "auto",
          overflowY: "hidden",
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch",
          overscrollBehaviorX: "contain",
          minHeight: 0
        }}
      >
        {slides.map((slide) => (
          <section
            key={slide.title}
            aria-label={slide.title}
            style={{
              flex: "0 0 100%",
              width: "100%",
              scrollSnapAlign: "start",
              scrollSnapStop: "always",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 28,
              padding: "0 24px",
              boxSizing: "border-box",
              minHeight: 0
            }}
          >
            <SlideVisual slide={slide} />
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
          </section>
        ))}
      </div>

      <div style={{ padding: "0 24px" }}>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16 }}>
          {slides.map((slide, i) => (
            <button
              key={slide.title}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === step ? "true" : undefined}
              onClick={() => scrollToStep(i)}
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
    </div>
  );
}
