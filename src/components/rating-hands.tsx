/** Handmade silhouette hands for bench ratings — no emoji. */

type HandProps = {
  size?: number;
  className?: string;
  title?: string;
};

const ink = "currentColor";

/** Thumbs down — bad sit */
export function HandThumbsDown({ size = 28, className, title }: HandProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path
        fill={ink}
        d="M12 4h8c1.1 0 2 .9 2 2v8h2.5c1.4 0 2.5 1.1 2.5 2.5V19c0 1.1-.7 2.1-1.7 2.4L20 23.5V28h-2.5c-1.1 0-2-.7-2.3-1.7L14 22H10V6c0-1.1.9-2 2-2zm-4 8H6c-1.1 0-2 .9-2 2v6c0 1.1.9 2 2 2h2V12z"
      />
    </svg>
  );
}

/** Flat open palm — middle / meh */
export function HandFlat({ size = 28, className, title }: HandProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path
        fill={ink}
        d="M10 4c.6 0 1 .4 1 1v9h1V3c0-.6.4-1 1-1s1 .4 1 1v11h1V2c0-.6.4-1 1-1s1 .4 1 1v12h1V4c0-.6.4-1 1-1s1 .4 1 1v12.5l.8-.5c.8-.5 1.9-.4 2.5.4l.1.1c.5.7.4 1.6-.2 2.2L18.5 26c-.6.6-1.4.9-2.2.9H11c-2.2 0-4-1.8-4-4V12c0-.6.4-1 1-1s1 .4 1 1v6h1V5c0-.6.4-1 1-1z"
      />
    </svg>
  );
}

/** Italian / pinched fingers — pretty good */
export function HandItalian({ size = 28, className, title }: HandProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path
        fill={ink}
        d="M16.2 3.2c.5-.4 1.2-.3 1.6.2l2.4 3.2c.2.3.3.6.3 1V12h.8c.9 0 1.7.5 2.1 1.3l1.8 3.6c.3.6.2 1.4-.3 1.9l-5.2 5.5c-.4.4-.9.6-1.4.6H12c-1.7 0-3-1.3-3-3v-6.2c0-.4.1-.8.4-1.1l5.5-6.4c.1-.2.2-.3.3-.5V4.5c0-.5.3-.9.7-1.1.1 0 .2-.1.3-.2zM9 16H7.5C6.1 16 5 17.1 5 18.5V22c0 1.4 1.1 2.5 2.5 2.5H9V16z"
      />
    </svg>
  );
}

/** One raised hand — great */
export function HandRaised({ size = 28, className, title }: HandProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path
        fill={ink}
        d="M15 2c.6 0 1 .4 1 1v8h1.2V3.5c0-.6.4-1 1-1s1 .4 1 1V11h1.2V5c0-.6.4-1 1-1s1 .4 1 1v8.2l1.4-.7c.7-.3 1.5-.1 1.9.5l.8 1.2c.4.6.3 1.4-.2 1.9L21 21.5V28h-2.2c-1 0-1.9-.6-2.2-1.5L15.5 23H12v-1.5c0-.8.3-1.6.9-2.2L16 16V3c0-.6.4-1 1-1h-2zm-5 12H8c-1.1 0-2 .9-2 2v7c0 1.1.9 2 2 2h2v-11z"
      />
    </svg>
  );
}

/** Two raised hands — life-changing */
export function HandRaisedPair({ size = 28, className, title }: HandProps) {
  return (
    <svg
      width={Math.round(size * 1.25)}
      height={size}
      viewBox="0 0 40 32"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path
        fill={ink}
        d="M8 3c.5 0 .9.4.9.9v7h1V4c0-.5.4-.9.9-.9s.9.4.9.9v7h1V5.2c0-.5.4-.9.9-.9s.9.4.9.9V13l1.1-.5c.5-.3 1.2-.1 1.5.4l.6 1c.3.5.2 1.1-.2 1.5L14.8 20v5.2h-1.7c-.8 0-1.5-.5-1.7-1.2L10.3 21H7.8v-1.2c0-.6.2-1.2.7-1.6L11 15V3.9c0-.5.4-.9.9-.9H8zM4.2 13H3c-.8 0-1.5.7-1.5 1.5v5.5c0 .8.7 1.5 1.5 1.5h1.2V13z"
      />
      <path
        fill={ink}
        d="M28 3c.5 0 .9.4.9.9v7h1V4c0-.5.4-.9.9-.9s.9.4.9.9v7h1V5.2c0-.5.4-.9.9-.9s.9.4.9.9V13l1.1-.5c.5-.3 1.2-.1 1.5.4l.6 1c.3.5.2 1.1-.2 1.5L34.8 20v5.2h-1.7c-.8 0-1.5-.5-1.7-1.2L30.3 21H27.8v-1.2c0-.6.2-1.2.7-1.6L31 15V3.9c0-.5.4-.9.9-.9H28zM36.8 13H38c.8 0 1.5.7 1.5 1.5v5.5c0 .8-.7 1.5-1.5 1.5h-1.2V13z"
      />
    </svg>
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
