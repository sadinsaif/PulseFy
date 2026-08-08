"use client";

import Link from "next/link";
import { useState } from "react";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      /* even on error we show the same neutral message */
    }
    setLoading(false);
    setDone(true);
  }

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <Link href="/" className="logo">
          <span className="logo-mark" aria-hidden="true" /><span className="wordmark">Pulse<span className="wm-fy">Fy</span></span>
        </Link>
        <h1>Reset your password</h1>
        <p className="lead">
          Enter your email and we&apos;ll send you a reset link.
        </p>

        {done ? (
          <>
            <div className="alert ok">
              If that email is registered, a reset link is on its way. Check your
              inbox.
            </div>
            <Link href="/login" className="btn btn-primary btn-block">
              Back to sign in
            </Link>
          </>
        ) : (
          <form onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@brand.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <button className="btn btn-primary btn-block" disabled={loading}>
              {loading ? "Sending…" : "Send reset link"}
            </button>
            <p className="auth-foot">
              Remembered it? <Link href="/login">Sign in</Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
