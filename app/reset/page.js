"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function ResetInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") || "";
  const email = params.get("email") || "";

  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const badLink = !token || !email;

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const res = await fetch("/api/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email, password }),
      });
      const data = await res.json().catch(() => ({}));
      setLoading(false);
      if (!res.ok) {
        setErr(data.error || "Could not reset your password.");
        return;
      }
      setDone(true);
    } catch {
      setLoading(false);
      setErr("Network error. Please try again.");
    }
  }

  return (
    <div className="auth-card">
      <Link href="/" className="logo">
        <span className="logo-mark" aria-hidden="true" /><span className="wordmark">Pulse<span className="wm-fy">Fy</span></span>
      </Link>
      <h1>Set a new password</h1>

      {badLink ? (
        <>
          <div className="alert err">
            This reset link is missing information or invalid. Request a new one.
          </div>
          <Link href="/forgot" className="btn btn-primary btn-block">
            Request new link
          </Link>
        </>
      ) : done ? (
        <>
          <div className="alert ok">
            Your password has been updated. You can sign in now.
          </div>
          <Link href="/login" className="btn btn-primary btn-block">
            Go to sign in
          </Link>
        </>
      ) : (
        <>
          <p className="lead">
            Choose a new password for <b>{email}</b>.
          </p>
          {err && <div className="alert err">{err}</div>}
          <form onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="password">New password</label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <button className="btn btn-primary btn-block" disabled={loading}>
              {loading ? "Updating…" : "Update password"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

export default function ResetPage() {
  return (
    <main className="auth-wrap">
      <Suspense fallback={<div className="auth-card">Loading…</div>}>
        <ResetInner />
      </Suspense>
    </main>
  );
}
