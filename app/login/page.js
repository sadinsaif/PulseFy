"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const verify = params.get("verify");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const notice =
    verify === "success"
      ? { type: "ok", msg: "Email verified — you can sign in now." }
      : verify === "expired"
      ? { type: "err", msg: "That verification link has expired. Try signing up again." }
      : verify === "invalid"
      ? { type: "err", msg: "That verification link is invalid." }
      : null;

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);

    if (res?.error) {
      if (res.code === "EMAIL_NOT_VERIFIED") {
        // Unverified account — send a fresh code and take them to the code
        // screen. Email + password stay the login credentials.
        fetch("/api/resend-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        }).catch(() => {});
        router.push(`/verify-email?email=${encodeURIComponent(email)}`);
        return;
      }
      setErr("Wrong email or password.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="auth-card">
      <Link href="/" className="logo">
        <span className="logo-mark" aria-hidden="true" /><span className="wordmark">Pulse<span className="wm-fy">Fy</span></span>
      </Link>
      <h1>Welcome back</h1>
      <p className="lead">Sign in to your PulseFy workspace.</p>

      {notice && <div className={`alert ${notice.type}`}>{notice.msg}</div>}
      {err && <div className="alert err">{err}</div>}

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
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div className="auth-row">
          <span />
          <Link href="/forgot">Forgot password?</Link>
        </div>
        <button className="btn btn-primary btn-block" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="auth-foot">
        New to PulseFy? <Link href="/signup">Create an account</Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="auth-wrap">
      <Suspense fallback={<div className="auth-card">Loading…</div>}>
        <LoginInner />
      </Suspense>
    </main>
  );
}
