"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { listFollowRequests } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/auth-context";

function HomeIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function CompassIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx={12} cy={12} r={10} />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx={12} cy={7} r={4} />
    </svg>
  );
}

const links = [
  { href: "/home", label: "home", icon: HomeIcon },
  { href: "/explore", label: "explore", icon: CompassIcon },
  { href: "/challenges", label: "play", icon: TrophyIcon },
  { href: "/profile", label: "profile", icon: UserIcon }
];

export function BottomNav() {
  const pathname = usePathname();
  const { profileId, user } = useAuth();
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const visibleLinks = user ? links : links.filter((item) => item.href !== "/home");

  useEffect(() => {
    if (!user || !profileId) {
      setPendingRequestCount(0);
      return;
    }
    listFollowRequests(profileId)
      .then((res) => setPendingRequestCount(res.incoming.length))
      .catch(() => setPendingRequestCount(0));
  }, [profileId, user]);

  return (
    <nav
      className="bottom-nav"
      aria-label="Primary"
      style={{ gridTemplateColumns: `repeat(${visibleLinks.length}, minmax(0, 1fr))` }}
    >
      {visibleLinks.map((item) => {
        const active = pathname?.startsWith(item.href);
        const Icon = item.icon;
        const isProfileLink = item.href === "/profile";
        const showRequestsBadge = isProfileLink && pendingRequestCount > 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={active ? "active" : undefined}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}
          >
            <span className="nav-icon-wrap">
              <Icon />
              {showRequestsBadge && (
                <span className="nav-badge" aria-label={`${pendingRequestCount} follow requests`}>
                  {pendingRequestCount > 9 ? "9+" : pendingRequestCount}
                </span>
              )}
            </span>
            <span style={{ fontSize: 11 }}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
