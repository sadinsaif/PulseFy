"use client";

import Link from "next/link";
import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function VerifyEmailInner() {
  const router = useRouter();
  const params = useSearchParams();
  const email = (params.get("email") || "").toLowerCase();

  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Tick the resend cooldown down to zero.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  // No email in the URL → nothing to verify; point them back to sign in.
  if (!email) {
    return (
      <div className="auth-card">
        <Link href="/" className="logo">
          <span className="logo-mark" aria-hidden="true" /><span className="wordmark">Pulse<span className="wm-fy">Fy</span></span>
        </Link>
        <h1>Verify your email</h1>
        <p className="lead">Open this screen from the sign-up or sign-in page so we know which account to verify.</p>
        <Link href="/login" className="btn btn-primary btn-block">Go to sign in</Link>
      </div>
    );
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    setLoading(true);
    try {
      const res = await fetch("/api/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json().catch(() => ({}));
      setLoading(false);
      if (!res.ok) {
        setErr(data.error || "Invalid code.");
        return;
      }
      router.push("/login?verify=success");
    } catch {
      setLoading(false);
      setErr("Network error. Please try again.");
    }
  }

  async function onResend() {
    if (cooldown > 0) return;
    setErr("");
    setMsg("");
    try {
      const res = await fetch("/api/resend-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        setCooldown(Math.ceil((data.retryAfterMs || 60000) / 1000));
        setErr(data.error || "Please wait before requesting another code.");
        return;
      }
      setMsg(data.message || "A new code is on its way.");
      setCooldown(60);
    } catch {
      setErr("Network error. Please try again.");
    }
  }

  return (
    <div className="auth-card">
      <Link href="/" className="logo">
        <span className="logo-mark" aria-hidden="true" /><span className="wordmark">Pulse<span className="wm-fy">Fy</span></span>
      </Link>
      <h1>Check your email</h1>
      <p className="lead">
        We sent a 6-digit code to <b>{email}</b>. Enter it below to verify your
        account.
      </p>

      {err && <div className="alert err">{err}</div>}
      {msg && <div className="alert ok">{msg}</div>}

      <form onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="code">Verification code</label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            style={{ letterSpacing: "10px", fontSize: 24, textAlign: "center", fontFamily: "monospace" }}
            required
          />
        </div>
        <button className="btn btn-primary btn-block" disabled={loading || code.length !== 6}>
          {loading ? "Verifying…" : "Verify email"}
        </button>
      </form>

      <p className="auth-foot">
        Didn&apos;t get the email?{" "}
        <button
          type="button"
          onClick={onResend}
          disabled={cooldown > 0}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            font: "inherit",
            fontWeight: 600,
            color: "var(--accent)",
            cursor: cooldown > 0 ? "default" : "pointer",
            opacity: cooldown > 0 ? 0.6 : 1,
          }}
        >
          {cooldown > 0 ? `Resend code (${cooldown}s)` : "Resend code"}
        </button>
      </p>
      <p className="auth-foot" style={{ marginTop: 6 }}>
        <Link href="/login">Back to sign in</Link>
      </p>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <main className="auth-wrap">
      <Suspense fallback={<div className="auth-card">Loading…</div>}>
        <VerifyEmailInner />
      </Suspense>
    </main>
  );
}
