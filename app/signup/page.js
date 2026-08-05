"use client";

import Link from "next/link";
import { useState } from "react";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json().catch(() => ({}));
      setLoading(false);
      if (!res.ok) {
        setErr(data.error || "Could not create your account. Try again.");
        return;
      }
      setMsg(data.message || data.warning || "Account created!");
      setDone(true);
    } catch {
      setLoading(false);
      setErr("Network error. Please try again.");
    }
  }

  if (done) {
    // When email verification is on, the message mentions checking email.
    const needsEmail = /email|verif|inbox/i.test(msg);
    return (
      <main className="auth-wrap">
        <div className="auth-card">
          <Link href="/" className="logo">
            <span className="logo-mark">S</span> Srijon
          </Link>
          <h1>{needsEmail ? "Check your inbox" : "You're all set 🎉"}</h1>
          <p className="lead">{msg}</p>
          {needsEmail && (
            <div className="alert info">
              Didn&apos;t get it? Check spam, or wait a minute and refresh your
              inbox.
            </div>
          )}
          <Link href="/login" className="btn btn-primary btn-block">
            Go to sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <Link href="/" className="logo">
          <span className="logo-mark">S</span> Srijon
        </Link>
        <h1>Create your account</h1>
        <p className="lead">Start running creator challenges in minutes.</p>

        {err && <div className="alert err">{err}</div>}

        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="name">Name or company</label>
            <input
              id="name"
              type="text"
              autoComplete="organization"
              placeholder="Nebula Inc."
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
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
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <button className="btn btn-primary btn-block" disabled={loading}>
            {loading ? "Creating…" : "Create account"}
          </button>
        </form>

        <p className="auth-foot">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
