import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { AuthProvider } from "@/src/contexts/auth-context";
import { BottomNav } from "@/src/components/bottom-nav";

export const metadata: Metadata = {
  title: "benchmark web",
  description: "mobile-first benchmark web app",
  icons: {
    icon: "/app-icon.png",
    apple: "/app-icon.png"
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
