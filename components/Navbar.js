"use client";

import Link from "next/link";
import { useState } from "react";
import { signOut } from "next-auth/react";

/**
 * Public marketing navbar. Ports the legacy .nav markup.
 * `session` is passed from the server layout/page; when present we show
 * Dashboard + Sign out instead of Sign in / Start free.
 */
export default function Navbar({ session }) {
  const [open, setOpen] = useState(false);

  return (
    <nav className="nav">
      <div className="container nav-inner">
        <Link href="/" className="logo">
          <span className="logo-mark">S</span>
          Srijon
        </Link>
        <div className="nav-links" style={open ? mobileOpen : undefined}>
          <a href="/#how">How it works</a>
          <a href="/#features">Features</a>
          <a href="/#pricing">Pricing</a>
          {session ? <Link href="/dashboard">Dashboard</Link> : null}
        </div>
        <div className="nav-cta">
          {session ? (
            <>
              <Link href="/dashboard" className="btn btn-primary">Dashboard</Link>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => signOut({ callbackUrl: "/" })}
              >
                Sign out
              </button>
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
