"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";
import NotificationBell from "@/components/NotificationBell";

const NAV = [
  { href: "/dashboard", icon: "▦", label: "Overview" },
  { href: "/dashboard/profile", icon: "🧑", label: "My Profile" },
  { href: "/dashboard/campaigns", icon: "🎯", label: "Campaigns" },
  { href: "/dashboard/creators", icon: "👥", label: "Creators" },
  { href: "/dashboard/submissions", icon: "✅", label: "Submissions", adminOnly: true },
  { href: "/dashboard/payouts", icon: "💸", label: "Payouts" },
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
  const isBrand = user?.role === "brand";
  const nav = NAV.filter((item) => {
    if (item.adminOnly) return isAdmin;
    if (item.creatorOnly) return !isBrand;
    return true;
  });

  return (
    <>
      <button className="mobile-menu" onClick={() => setOpen((v) => !v)}>☰</button>
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <Link href="/" className="logo">
          <span className="logo-mark">S</span> Srijon
        </Link>
        <div className="side-notif">
          <NotificationBell />
        </div>
        <nav className="side-nav">
          {nav.map((item, i) => {
            const active =
              item.href !== "#" &&
              (pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href.split("/").slice(0, 2).join("/"))));
            return (
              <Link key={i} href={item.href} className={active ? "active" : ""}>
                <span className="ic">{item.icon}</span> {item.label}
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
