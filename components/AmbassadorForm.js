"use client";

import Link from "next/link";
import { useState } from "react";

const PLATFORMS = [
  ["tiktok", "🎵 TikTok"],
  ["instagram", "📸 Instagram"],
  ["youtube", "▶️ YouTube"],
  ["x", "𝕏 X"],
  ["other", "🌐 Other"],
];

const FOLLOWER_TIERS = ["0-1k", "1k-10k", "10k-50k", "50k-250k", "250k+"];

const PERKS = [
  ["💸", "Earn on every referral", "Get 5% of the payouts earned by every creator you bring to PulseFy — for their first 90 days."],
  ["⚡", "Early access", "Be first to try new campaign tools, payout rails, and creator features before anyone else."],
  ["🎯", "Priority campaigns", "Ambassadors get surfaced to brands first and matched to high-value, on-brand challenges."],
  ["🛠️", "Co-marketing support", "We amplify your content, feature you on the platform, and help you grow your own audience."],
];

const STEPS = [
  ["Apply", "Tell us about your audience and why you'd be a great fit. Takes two minutes."],
  ["Get onboarded", "We review your application and set you up with your ambassador toolkit and referral link."],
  ["Grow & earn", "Share PulseFy, bring creators and brands in, and earn as the community you build grows."],
];

/**
 * Public Ambassador Program application form. Posts to /api/ambassador, which
 * validates and notifies the PulseFy team (no account required to apply).
 */
export default function AmbassadorForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [platform, setPlatform] = useState("tiktok");
  const [handle, setHandle] = useState("");
  const [followers, setFollowers] = useState("1k-10k");
  const [pitch, setPitch] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const res = await fetch("/api/ambassador", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, platform, handle, followers, pitch }),
      });
      const data = await res.json().catch(() => ({}));
      setLoading(false);
      if (!res.ok) {
        setErr(data.error || "Could not send your application. Try again.");
        return;
      }
      setMsg(data.message || "Application received!");
      setDone(true);
    } catch {
      setLoading(false);
      setErr("Network error. Please try again.");
    }
  }

  return (
    <>
      {/* HERO */}
      <header className="hero">
        <div className="container">
          <span className="pill">
            <span className="dot"></span> PulseFy Ambassador Program
          </span>
          <h1>
            Grow the creator economy
            <br />
            <span className="grad">and get rewarded for it</span>
          </h1>
          <p className="sub">
            Ambassadors bring creators and brands into PulseFy, unlock exclusive
            perks, and earn on everyone they refer. If you love the product and
            have an audience, we&apos;d love to have you.
          </p>
          <div className="hero-actions">
            <a href="#apply" className="btn btn-primary btn-lg">
              Apply now →
            </a>
            <Link href="/#how" className="btn btn-ghost btn-lg">
              How PulseFy works
            </Link>
          </div>
        </div>
      </header>

      {/* PERKS */}
      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="tag">Why join</span>
            <h2>Perks that grow with you</h2>
            <p>The more you build, the more you earn and unlock.</p>
          </div>
          <div className="features">
            {PERKS.map(([icon, title, body]) => (
              <div className="feature" key={title}>
                <div className="feature-icon">{icon}</div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="tag">How it works</span>
            <h2>Three steps to get started</h2>
            <p>From application to earning, in a weekend.</p>
          </div>
          <div className="steps">
            {STEPS.map(([title, body], i) => (
              <div className="step" key={title}>
                <div className="step-num">{i + 1}</div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* APPLICATION FORM */}
      <section className="section" id="apply">
        <div className="container">
          <div className="section-head">
            <span className="tag">Apply</span>
            <h2>Become an Ambassador</h2>
            <p>Tell us about yourself. We review every application personally.</p>
          </div>

          <div className="panel" style={{ maxWidth: 640, margin: "0 auto" }}>
            {done ? (
              <div style={{ textAlign: "center", padding: "12px 4px" }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>🎉</div>
                <h3 style={{ fontSize: 20, marginBottom: 8 }}>
                  You&apos;re on our radar
                </h3>
                <p className="brief" style={{ marginBottom: 22 }}>{msg}</p>
                <Link href="/" className="btn btn-ghost">
                  ← Back to home
                </Link>
              </div>
            ) : (
              <form onSubmit={onSubmit}>
                {err && <div className="alert err">{err}</div>}

                <div className="field">
                  <label htmlFor="amb-name">Your name</label>
                  <input
                    id="amb-name"
                    type="text"
                    autoComplete="name"
                    placeholder="Maya Rahman"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>

                <div className="field">
                  <label htmlFor="amb-email">Email</label>
                  <input
                    id="amb-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="field">
                  <label>Main platform</label>
                  <div className="platform-row">
                    {PLATFORMS.map(([val, label]) => (
                      <button
                        type="button"
                        key={val}
                        className={`platform-chip ${platform === val ? "active" : ""}`}
                        onClick={() => setPlatform(val)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="amb-handle">Handle or channel</label>
                  <input
                    id="amb-handle"
                    type="text"
                    placeholder="@yourhandle or channel link"
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    required
                  />
                </div>

                <div className="field">
                  <label>Audience size</label>
                  <div className="platform-row">
                    {FOLLOWER_TIERS.map((tier) => (
                      <button
                        type="button"
                        key={tier}
                        className={`platform-chip ${followers === tier ? "active" : ""}`}
                        onClick={() => setFollowers(tier)}
                      >
                        {tier}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="amb-pitch">Why would you be a great ambassador?</label>
                  <textarea
                    id="amb-pitch"
                    rows={5}
                    placeholder="Tell us about your audience, your content, and how you'd share PulseFy…"
                    value={pitch}
                    onChange={(e) => setPitch(e.target.value)}
                    minLength={30}
                    maxLength={2000}
                    required
                  />
                </div>

                <button className="btn btn-primary btn-block" disabled={loading}>
                  {loading ? "Sending…" : "Submit application"}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
