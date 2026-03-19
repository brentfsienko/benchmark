import Image from "next/image";

type BenchmarkLogoProps = {
  size?: number;
  showWordmark?: boolean;
};

export function BenchmarkLogo({ size = 32, showWordmark = true }: BenchmarkLogoProps) {
  const wordmarkSize = Math.round(size * 0.9);
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
      <Image
        src="/app-icon.png"
        alt="benchmark"
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: size * 0.22 }}
        priority
      />
      {showWordmark ? (
        <span
          style={{
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "lowercase",
            fontSize: wordmarkSize,
            color: "var(--text-primary)"
          }}
        >
          benchmark
        </span>
      ) : null}
    </div>
  );
}
