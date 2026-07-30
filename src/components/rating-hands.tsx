import type { ReactNode } from "react";

/** Silhouette hands for bench ratings — clear fingers + palm at small sizes. */

type HandProps = {
  size?: number;
  className?: string;
  title?: string;
};

function HandSvg({
  size = 28,
  width,
  className,
  title,
  viewBox = "0 0 32 32",
  children,
}: HandProps & { viewBox?: string; children: ReactNode; width?: number }) {
  return (
    <svg
      width={width ?? size}
      height={size}
      viewBox={viewBox}
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      fill="currentColor"
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

/** Thumbs down — bad sit */
export function HandThumbsDown({ size = 28, className, title }: HandProps) {
  return (
    <HandSvg size={size} className={className} title={title}>
      {/* Fist / knuckle block */}
      <rect x="10" y="4" width="12" height="14" rx="3.5" />
      {/* Downward thumb */}
      <rect x="13.5" y="16" width="5" height="11" rx="2.5" />
      {/* Palm heel stub on the side */}
      <rect x="6" y="8" width="5" height="10" rx="2.5" />
    </HandSvg>
  );
}

/** Flat open palm — middle / meh */
export function HandFlat({ size = 28, className, title }: HandProps) {
  return (
    <HandSvg size={size} className={className} title={title}>
      {/* Four fingers upright */}
      <rect x="8" y="2" width="3.2" height="12" rx="1.6" />
      <rect x="12.1" y="1" width="3.2" height="13" rx="1.6" />
      <rect x="16.2" y="1" width="3.2" height="13" rx="1.6" />
      <rect x="20.3" y="2.5" width="3.2" height="11.5" rx="1.6" />
      {/* Palm */}
      <rect x="8" y="12" width="15.5" height="12" rx="4" />
      {/* Thumb out to the left */}
      <rect x="3.5" y="13" width="6" height="3.4" rx="1.7" transform="rotate(-28 6.5 14.7)" />
    </HandSvg>
  );
}

/** Italian / pinched fingers — pretty good */
export function HandItalian({ size = 28, className, title }: HandProps) {
  return (
    <HandSvg size={size} className={className} title={title}>
      {/* Pinched tip cluster */}
      <ellipse cx="16" cy="7" rx="4.5" ry="5.5" />
      {/* Wrist / lower hand */}
      <path d="M11.5 10.5c-1.2 1.8-2 4-2 6.5 0 3.6 2.7 6.5 6.5 6.5s6.5-2.9 6.5-6.5c0-2.5-.8-4.7-2-6.5-.8 1.4-2.5 2.3-4.5 2.3s-3.7-.9-4.5-2.3z" />
      {/* Thumb flare */}
      <rect x="7" y="14" width="5.5" height="3.2" rx="1.6" transform="rotate(-35 9.75 15.6)" />
    </HandSvg>
  );
}

/** One raised hand — great */
export function HandRaised({ size = 28, className, title }: HandProps) {
  return (
    <HandSvg size={size} className={className} title={title}>
      {/* Fingers — clear separate digits */}
      <rect x="8" y="2" width="3.4" height="13" rx="1.7" />
      <rect x="12.2" y="1" width="3.4" height="14" rx="1.7" />
      <rect x="16.4" y="1" width="3.4" height="14" rx="1.7" />
      <rect x="20.6" y="2.5" width="3.4" height="12.5" rx="1.7" />
      {/* Palm */}
      <rect x="8" y="13" width="16" height="13" rx="4.5" />
      {/* Thumb */}
      <rect x="3.2" y="14.5" width="7" height="3.6" rx="1.8" transform="rotate(-32 6.7 16.3)" />
    </HandSvg>
  );
}

/** Two raised hands — life-changing */
export function HandRaisedPair({ size = 28, className, title }: HandProps) {
  return (
    <HandSvg
      size={size}
      width={Math.round(size * 1.4)}
      className={className}
      title={title}
      viewBox="0 0 44 32"
    >
      {/* Left hand */}
      <rect x="5" y="2" width="3" height="12" rx="1.5" />
      <rect x="8.6" y="1" width="3" height="13" rx="1.5" />
      <rect x="12.2" y="1" width="3" height="13" rx="1.5" />
      <rect x="15.8" y="2.5" width="3" height="11.5" rx="1.5" />
      <rect x="5" y="12" width="13.8" height="12" rx="4" />
      <rect x="1" y="13.5" width="6" height="3.2" rx="1.6" transform="rotate(-32 4 15.1)" />
      {/* Right hand */}
      <rect x="25" y="2" width="3" height="12" rx="1.5" />
      <rect x="28.6" y="1" width="3" height="13" rx="1.5" />
      <rect x="32.2" y="1" width="3" height="13" rx="1.5" />
      <rect x="35.8" y="2.5" width="3" height="11.5" rx="1.5" />
      <rect x="25" y="12" width="13.8" height="12" rx="4" />
      <rect x="37.5" y="13.5" width="6" height="3.2" rx="1.6" transform="rotate(32 40.5 15.1)" />
    </HandSvg>
  );
}

export function RatingHand({ rating, size = 32 }: { rating: number; size?: number }) {
  if (rating < 2) {
    return <HandThumbsDown size={size} title="thumbs down" />;
  }
  if (rating < 3) {
    return <HandFlat size={size} title="flat hand" />;
  }
  if (rating < 4) {
    return <HandItalian size={size} title="italian hand" />;
  }
  if (rating < 5) {
    return <HandRaised size={size} title="raised hand" />;
  }
  return <HandRaisedPair size={size} title="two raised hands" />;
}
