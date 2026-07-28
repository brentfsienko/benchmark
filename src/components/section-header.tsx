import type { ReactNode } from "react";
import { BenchmarkLogo } from "./benchmark-logo";

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  showBrand?: boolean;
  action?: ReactNode;
};

export function SectionHeader({ title, subtitle, showBrand = true, action }: SectionHeaderProps) {
  return (
    <header style={{ flexShrink: 0 }}>
      {showBrand ? (
        <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <BenchmarkLogo size={36} />
          {action ? <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{action}</div> : null}
        </div>
      ) : action ? (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>{action}</div>
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
