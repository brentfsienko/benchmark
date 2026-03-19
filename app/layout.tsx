import type { Metadata, Viewport } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";
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
        <main>{children}</main>
        <BottomNav />
      </body>
    </html>
  );
}
