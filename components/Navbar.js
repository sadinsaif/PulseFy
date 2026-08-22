"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import SignOutButton from "@/components/SignOutButton";

/**
 * Public marketing navbar. Ports the legacy .nav markup.
 * `session` is passed from the server layout/page; when present we show
 * Dashboard + Sign out instead of Sign in / Start free.
 */
export default function Navbar({ session }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // "Become an Ambassador" links to /ambassador. But when the visitor is
  // ALREADY on that page, a link to the same route is a visual no-op — it
  // reads as "the button doesn't work". So in that case scroll to the
  // application form instead, so the click always does something.
  function onAmbassadorClick(e) {
    setOpen(false);
    if (pathname === "/ambassador" && typeof document !== "undefined") {
      const apply = document.getElementById("apply");
      if (apply) {
        e.preventDefault();
        apply.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }

  return (
    <nav className="nav">
      <div className="container nav-inner">
        <Link href="/" className="logo">
          <span className="logo-mark" aria-hidden="true" />
          <span className="wordmark">Pulse<span className="wm-fy">Fy</span></span>
        </Link>
        <div className="nav-links" style={open ? mobileOpen : undefined}>
          <a href="/#creators">For Creators</a>
          <a href="/#brands">For Brands</a>
          <a href="/#how">How it works</a>
          <a href="/#features">Features</a>
          <a href="/#pricing">Pricing</a>
          <Link href="/token">$PULSE</Link>
          <Link
            href="/ambassador"
            className="btn btn-ambassador"
            onClick={onAmbassadorClick}
          >
            <span className="amb-star" aria-hidden="true">★</span>
            Become an Ambassador
          </Link>
          {session ? <Link href="/dashboard">Dashboard</Link> : null}
        </div>
        <div className="nav-cta">
          {session ? (
            <>
              <Link href="/dashboard" className="btn btn-primary">Dashboard</Link>
              <SignOutButton className="btn btn-ghost">Sign out</SignOutButton>
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost">Sign in</Link>
              <Link href="/signup" className="btn btn-primary">Start free</Link>
            </>
          )}
        </div>
        <button className="nav-toggle" onClick={() => setOpen((v) => !v)}>
          ☰
        </button>
      </div>
    </nav>
  );
}

const mobileOpen = {
  display: "flex",
  flexDirection: "column",
  position: "absolute",
  top: "68px",
  left: 0,
  right: 0,
  background: "var(--bg-elev)",
  padding: "20px 24px",
  borderBottom: "1px solid var(--border)",
  gap: "18px",
};
