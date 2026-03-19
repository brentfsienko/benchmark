import { BenchmarkLogo } from "./benchmark-logo";

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  showBrand?: boolean;
};

export function SectionHeader({ title, subtitle, showBrand = true }: SectionHeaderProps) {
  return (
    <header style={{ flexShrink: 0 }}>
      {showBrand ? (
        <div style={{ marginBottom: 12 }}>
          <BenchmarkLogo size={36} />
        </div>
      ) : null}
      <h1 style={{ margin: 0, textTransform: "lowercase", fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" }}>
        {title}
      </h1>
      {subtitle ? (
        <p className="muted" style={{ margin: "8px 0 0 0", fontSize: 14, lineHeight: 1.4 }}>
          {subtitle}
        </p>
      ) : null}
    </header>
  );
}
