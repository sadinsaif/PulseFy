"use client";

import Link from "next/link";
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const ROLES = {
  creator: {
    icon: "🎬",
    title: "Start as Creator",
    blurb: "Work on brand campaigns and get paid for your clips.",
    nameLabel: "Your name",
    namePlaceholder: "Maya Rahman",
    emailPlaceholder: "you@email.com",
    lead: "Join campaigns, submit your posts, and earn.",
    cta: "Start creating",
  },
  brand: {
    icon: "🏢",
    title: "Start as Brand",
    blurb: "Run campaigns and hire creators to make your product go viral.",
    nameLabel: "Company name",
    namePlaceholder: "Nebula Inc.",
    emailPlaceholder: "you@brand.com",
    lead: "Launch campaigns and let creators amplify your reach.",
    cta: "Start a campaign",
  },
};

function SignupInner() {
  const params = useSearchParams();
  const initialRole = params.get("role") === "brand" ? "brand" : "creator";
  // Referral — who invited this user (?ref=<username>). Forwarded to the
  // register API so the referrer gets credited.
  const ref = params.get("ref") || "";

  const [role, setRole] = useState(initialRole);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const cfg = ROLES[role];

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, username, email, password, role, ref }),
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
    const needsEmail = /email|verif|inbox/i.test(msg);
    return (
      <main className="auth-wrap">
        <div className="auth-card">
          <Link href="/" className="logo">
            <span className="logo-mark" aria-hidden="true" /><span className="wordmark">Pulse<span className="wm-fy">Fy</span></span>
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
          <span className="logo-mark" aria-hidden="true" /><span className="wordmark">Pulse<span className="wm-fy">Fy</span></span>
        </Link>
        <h1>Create your account</h1>
        <p className="lead">{cfg.lead}</p>

        {/* Role picker — Creator vs Brand */}
        <div className="role-picker">
          {Object.entries(ROLES).map(([key, r]) => (
            <button
              type="button"
              key={key}
              className={`role-opt ${role === key ? "active" : ""}`}
              onClick={() => setRole(key)}
            >
              <span className="role-ic">{r.icon}</span>
              <b>{r.title}</b>
              <span className="role-blurb">{r.blurb}</span>
            </button>
          ))}
        </div>

        {err && <div className="alert err">{err}</div>}

        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="name">{cfg.nameLabel}</label>
            <input
              id="name"
              type="text"
              autoComplete={role === "brand" ? "organization" : "name"}
              placeholder={cfg.namePlaceholder}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              placeholder="e.g. maya_rahman"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              minLength={3}
              maxLength={30}
              pattern="[a-zA-Z0-9_.]+"
              title="Letters, numbers, _ and . only (3–30 characters)"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder={cfg.emailPlaceholder}
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
            {loading ? "Creating…" : cfg.cta}
          </button>
        </form>

        <p className="auth-foot">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<main className="auth-wrap" />}>
      <SignupInner />
    </Suspense>
  );
}
