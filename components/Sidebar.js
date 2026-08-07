"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import NotificationBell from "@/components/NotificationBell";

const NAV = [
  { href: "/dashboard", icon: "▦", label: "Overview" },
  { href: "/dashboard/profile", icon: "🧑", label: "My Profile" },
  { href: "/dashboard/campaigns", icon: "🎯", label: "Campaigns" },
  { href: "/dashboard/creators", icon: "👥", label: "Creators" },
  { href: "/dashboard/inbox", icon: "✉️", label: "Inbox", badge: "messages" },
  { href: "/dashboard/submissions", icon: "✅", label: "Submissions", adminOnly: true },
  { href: "/dashboard/payouts", icon: "💸", label: "Payouts" },
  { href: "/dashboard/referrals", icon: "🔗", label: "Referrals", creatorOnly: true },
  { href: "#", icon: "📈", label: "Analytics" },
  { href: "#", icon: "⚙️", label: "Settings" },
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
          <span className="logo-mark" aria-hidden="true" /> Pulsefy
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
            return (
              <Link key={i} href={item.href} className={active ? "active" : ""}>
                <span className="ic">{item.icon}</span> {item.label}
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
