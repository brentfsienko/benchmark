import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { AuthProvider } from "@/src/contexts/auth-context";
import { BottomNav } from "@/src/components/bottom-nav";

export const metadata: Metadata = {
  title: "Benchmark - have a seat",
  description: "Find benches, leave benchmarks, and explore the city one seat at a time.",
  applicationName: "Benchmark",
  icons: {
    icon: "/app-icon.png",
    apple: "/app-icon.png"
  },
  openGraph: {
    title: "Benchmark - have a seat",
    description: "Find benches, leave benchmarks, and explore the city one seat at a time.",
    siteName: "Benchmark",
    type: "website",
    url: "https://benchmark.rest"
  },
  twitter: {
    card: "summary",
    title: "Benchmark - have a seat",
    description: "Find benches, leave benchmarks, and explore the city one seat at a time."
  }
};

export const viewport: Viewport = {
  viewportFit: "cover"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <main>{children}</main>
          <BottomNav />
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
