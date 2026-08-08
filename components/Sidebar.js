"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import NotificationBell from "@/components/NotificationBell";

const NAV = [
  { href: "/dashboard", icon: "▦", label: "Overview" },
  { href: "/dashboard/campaigns", icon: "🎯", label: "Campaigns" },
  { href: "/dashboard/my-applications", icon: "📄", label: "My Applications", creatorOnly: true },
  { href: "/dashboard/creators", icon: "🏆", label: "Leaderboard", creatorOnly: true },
  { href: "/dashboard/discover", icon: "🔎", label: "Discover Creators", brandOnly: true },
  { href: "/dashboard/applications", icon: "📥", label: "Applications", brandOnly: true },
  { href: "/dashboard/inbox", icon: "✉️", label: "Inbox", badge: "messages" },
  { href: "/dashboard/submissions", icon: "✅", label: "Submissions", adminOnly: true },
  { href: "/dashboard/payouts", icon: "💸", label: "Payouts", brandLabel: "Payments" },
  { href: "/dashboard/referrals", icon: "🔗", label: "Referrals", creatorOnly: true },
  { href: "/dashboard/analytics", icon: "📈", label: "Analytics" },
];

/**
 * Dashboard sidebar. Ports the legacy .sidebar markup and adds
 * pathname-based active highlighting plus a real Sign out button.
 * Nav items are filtered by the user's role (creator vs brand).
 */
export default function Sidebar({ user, isAdmin = false }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [unreadMsgs, setUnreadMsgs] = useState(0);
  const isBrand = user?.role === "brand";
  const nav = NAV.filter((item) => {
    if (item.adminOnly) return isAdmin;
    if (item.brandOnly) return isBrand;
    if (item.creatorOnly) return !isBrand;
    return true;
  });

  // Poll the unread-message count for the Inbox badge.
  useEffect(() => {
    let alive = true;
    async function loadUnread() {
      try {
        const res = await fetch("/api/messages?count=1");
        if (!res.ok) return;
        const data = await res.json();
        if (alive) setUnreadMsgs(Number(data.unread || 0));
      } catch {
        /* silent */
      }
    }
    loadUnread();
    const timer = setInterval(loadUnread, 20000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [pathname]);

  return (
    <>
      <button className="mobile-menu" onClick={() => setOpen((v) => !v)}>☰</button>
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <Link href="/" className="logo">
          <span className="logo-mark" aria-hidden="true" />
          <span className="wordmark">Pulse<span className="wm-fy">Fy</span></span>
        </Link>
        <div className="side-notif">
          <NotificationBell />
        </div>
        <nav className="side-nav">
          {nav.map((item, i) => {
            const active =
              item.href !== "#" &&
              (pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href + "/")));
            const showBadge = item.badge === "messages" && unreadMsgs > 0;
            const label = isBrand && item.brandLabel ? item.brandLabel : item.label;
            return (
              <Link key={i} href={item.href} className={active ? "active" : ""}>
                <span className="ic">{item.icon}</span> {label}
                {showBadge && <span className="nav-badge">{unreadMsgs}</span>}
              </Link>
            );
          })}
        </nav>
        <button
          className="logout-btn"
          style={{ marginTop: "auto", width: "100%" }}
          onClick={() => signOut({ callbackUrl: "/" })}
        >
          Sign out
        </button>
      </aside>
    </>
  );
}
