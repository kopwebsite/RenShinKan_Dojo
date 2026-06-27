import { useEffect, useId, useRef, useState } from "react";
import { assetPath } from "../utils/assetPath";

type BrushCircleLogoProps = {
  className?: string;
  imageClassName?: string;
  label?: string;
  decorative?: boolean;
  paintOn?: boolean;
};

function getPrefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(getPrefersReducedMotion);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);

    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  return prefersReducedMotion;
}

export function BrushCircleLogo({
  className = "",
  imageClassName = "",
  label = "Dojo red brush circle logo",
  decorative = false,
  paintOn = false,
}: BrushCircleLogoProps) {
  const [useFallback, setUseFallback] = useState(false);
  const [shouldPlay, setShouldPlay] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = usePrefersReducedMotion();
  const paintId = useId().replace(/:/g, "");
  const maskId = `renshinkan-paint-${paintId}`;
  const roughId = `renshinkan-rough-${paintId}`;
  const shouldPaintOn = paintOn && !shouldReduceMotion && !useFallback;

  useEffect(() => {
    if (!shouldPaintOn) {
      setShouldPlay(false);
      return undefined;
    }

    const root = rootRef.current;

    if (!root || !("IntersectionObserver" in window)) {
      setShouldPlay(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldPlay(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.35 },
    );

    observer.observe(root);
    return () => observer.disconnect();
  }, [shouldPaintOn]);

  const showPaintLayer = shouldPaintOn;
  const showFinishedImage = !useFallback && !showPaintLayer;

  return (
    <div
      ref={rootRef}
      className={`relative aspect-square ${className}`}
      aria-hidden={decorative || undefined}
    >
      {showFinishedImage ? (
        <img
          src={assetPath("/optimized/brand/renshinkan-logo.webp")}
          alt={decorative ? "" : label}
          className={`h-full w-full object-contain ${imageClassName}`}
          width={384}
          height={384}
          loading="eager"
          decoding="async"
          onError={() => setUseFallback(true)}
        />
      ) : null}
      {useFallback ? (
        <svg
          viewBox="0 0 240 240"
          role={decorative ? undefined : "img"}
          aria-label={decorative ? undefined : label}
          className={`h-full w-full ${imageClassName}`}
        >
          <path
            d="M176 38c29 20 40 59 27 92-19 48-81 67-128 38"
            fill="none"
            stroke="hsl(var(--color-vermilion))"
            strokeWidth="21"
            strokeLinecap="round"
            opacity="0.92"
          />
          <path
            d="M74 172c-31-26-35-74-9-106 10-13 25-23 42-28"
            fill="none"
            stroke="hsl(var(--color-vermilion))"
            strokeWidth="18"
            strokeLinecap="round"
            opacity="0.78"
          />
          <path
            d="M43 140c-8 10-14 20-15 31"
            fill="none"
            stroke="hsl(var(--color-vermilion))"
            strokeWidth="20"
            strokeLinecap="round"
            opacity="0.86"
          />
          <circle cx="120" cy="123" r="20" fill="hsl(var(--color-vermilion))" />
        </svg>
      ) : null}
      {showPaintLayer ? (
        <svg
          viewBox="0 0 100 100"
          className={`renshinkan-logo-paint-layer ${shouldPlay ? "renshinkan-logo-is-playing" : ""} h-full w-full ${imageClassName}`}
          role={decorative ? undefined : "img"}
          aria-label={decorative ? undefined : label}
        >
          <defs>
            <filter
              id={roughId}
              filterUnits="userSpaceOnUse"
              x="-20"
              y="-20"
              width="140"
              height="140"
            >
              <feTurbulence baseFrequency="0.9" numOctaves={2} seed={3} />
              <feDisplacementMap in="SourceGraphic" scale={0.6} />
            </filter>
            <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
              <rect width="100" height="100" fill="black" />
              <path
                className="renshinkan-logo-mask-bottom"
                d="M38 17 C24 28 20 48 29 65 C42 89 75 87 91 63"
                fill="none"
                stroke="white"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="23"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1}
                opacity={0}
                filter={`url(#${roughId})`}
              />
              <path
                className="renshinkan-logo-mask-top"
                d="M56 13 C74 12 89 23 93 39 C95 47 92 55 87 62"
                fill="none"
                stroke="white"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="22"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1}
                opacity={0}
                filter={`url(#${roughId})`}
              />
              <path
                className="renshinkan-logo-mask-left"
                d="M13 54 C8 62 6 70 8 76"
                fill="none"
                stroke="white"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="14"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1}
                opacity={0}
                filter={`url(#${roughId})`}
              />
              <path
                className="renshinkan-logo-mask-center"
                d="M50 39 C58 38 63 46 60 53 C56 58 47 54 48 46"
                fill="none"
                stroke="white"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="14"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1}
                opacity={0}
                filter={`url(#${roughId})`}
              />
            </mask>
          </defs>
          <image
            href={assetPath("/optimized/brand/renshinkan-logo.webp")}
            width="100"
            height="100"
            preserveAspectRatio="xMidYMid meet"
            mask={`url(#${maskId})`}
            onError={() => setUseFallback(true)}
          />
        </svg>
      ) : null}
    </div>
  );
}
