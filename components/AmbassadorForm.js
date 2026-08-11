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

// Kept in sync with AMBASSADOR_CATEGORIES / AMBASSADOR_REFERRAL_SOURCES in
// lib/validation.js (value → label).
const CATEGORIES = [
  ["technology", "Technology"],
  ["gaming", "Gaming"],
  ["lifestyle", "Lifestyle"],
  ["beauty", "Beauty & Fashion"],
  ["education", "Education"],
  ["business", "Business"],
  ["entertainment", "Entertainment"],
  ["fitness", "Fitness"],
  ["other", "Other"],
];

const REFERRAL_SOURCES = [
  ["search", "Search engine"],
  ["social", "Social media"],
  ["friend", "A friend"],
  ["creator", "Another creator"],
  ["event", "An event"],
  ["other", "Other"],
];

// Ambassador Benefits (req: 6 compact cards).
const BENEFITS = [
  ["🎁", "Exclusive campaigns", "Get matched to invite-only, high-value campaigns before they open to everyone."],
  ["⚡", "Early access", "Be first to try new opportunities, payout rails, and creator tools."],
  ["🏅", "Ambassador badge", "A badge on your profile that signals trust to brands and creators."],
  ["💸", "Referral rewards", "Earn 5% of the payouts made by every creator you bring to PulseFy."],
  ["🌟", "Featured creator", "Get spotlighted across PulseFy and surfaced to brands as a top creator."],
  ["🤝", "Dedicated support", "A direct line to the ambassador team whenever you need a hand."],
];

// Who can apply (req: 6 requirements).
const REQUIREMENTS = [
  "You're an active content creator",
  "At least one public social profile",
  "Consistent, recent content activity",
  "A genuine, engaged audience",
  "Good standing with PulseFy",
  "You agree to follow the PulseFy community guidelines",
];

// How it works (req: 4 steps, horizontal on desktop / vertical on mobile).
const HOW_STEPS = [
  ["Apply", "Fill out the short application below. It takes about two minutes."],
  ["Review", "Our team reviews your audience and content — every application personally."],
  ["Get approved", "We set you up with your ambassador toolkit and referral link."],
  ["Start earning", "Share PulseFy, bring creators and brands in, and earn as you grow."],
];

const STATUS_LABEL = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under review",
  approved: "Approved",
  rejected: "Rejected",
};
// Map to existing .status.{live,review,ended} pill colours.
const STATUS_CLASS = {
  draft: "ended",
  submitted: "review",
  under_review: "review",
  approved: "live",
  rejected: "ended",
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const URL_RE = /^https?:\/\/.+/i;

function formatDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

/**
 * Application status / confirmation card. Shows only real data — the stored
 * status and the real submission date. No fake review dates or approvals.
 */
function StatusCard({ application, freshlySubmitted }) {
  const status = application.status || "under_review";
  const label = STATUS_LABEL[status] || "Submitted";
  const cls = STATUS_CLASS[status] || "review";
  const submitted = formatDate(application.submittedAt);
  const reviewed = formatDate(application.reviewedAt);

  const heading =
    status === "approved"
      ? "You're a PulseFy Ambassador 🎉"
      : status === "rejected"
      ? "Application reviewed"
      : "Application submitted";

  return (
    <div className="amb-status">
      <div className="amb-status-icon" aria-hidden="true">
        {status === "approved" ? "🎉" : status === "rejected" ? "📄" : "✅"}
      </div>
      <h3>{heading}</h3>
      <p className="brief">
        {freshlySubmitted
          ? "Thanks for applying to become a PulseFy Ambassador."
          : "Here's the current status of your Ambassador application."}
      </p>

      <div className="amb-status-meta">
        <div className="amb-status-row">
          <span>Status</span>
          <span className={`status ${cls}`}>{label}</span>
        </div>
        {submitted && (
          <div className="amb-status-row">
            <span>Submitted</span>
            <strong>{submitted}</strong>
          </div>
        )}
        {reviewed && (
          <div className="amb-status-row">
            <span>Reviewed</span>
            <strong>{reviewed}</strong>
          </div>
        )}
      </div>

      <p className="amb-status-note">
        {status === "approved"
          ? "Welcome aboard! Our team will be in touch with your ambassador toolkit."
          : status === "rejected"
          ? "Thanks for your interest — this application wasn't selected this time."
          : "Our team reviews every application personally and will reach out by email."}
      </p>

      <Link href="/" className="btn btn-ghost">← Back to home</Link>
    </div>
  );
}

/**
 * Public Ambassador Program page — hero, benefits, who-can-apply, how-it-works,
 * and the application form. Posts to /api/ambassador, which validates, persists,
 * prevents duplicate active applications, and notifies the PulseFy team.
 *
 * `existingApplication` (optional) is the signed-in user's active application,
 * looked up server-side. When present we show its real status instead of the
 * form again.
 */
export default function AmbassadorForm({ existingApplication = null }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const [platform, setPlatform] = useState("tiktok");
  const [handle, setHandle] = useState("");
  const [socialLink, setSocialLink] = useState("");
  const [followers, setFollowers] = useState("1k-10k");
  const [category, setCategory] = useState("");
  const [referralSource, setReferralSource] = useState("");
  const [pitch, setPitch] = useState("");
  const [agree, setAgree] = useState(false);

  const [fieldErrors, setFieldErrors] = useState({});
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(null); // the created application

  function validate() {
    const e = {};
    if (name.trim().length < 2) e.name = "Enter your name";
    if (!EMAIL_RE.test(email.trim())) e.email = "Enter a valid email";
    if (country.trim().length < 2) e.country = "Tell us where you're based";
    if (handle.trim().length < 2) e.handle = "Enter your handle or channel";
    if (socialLink.trim() && !URL_RE.test(socialLink.trim()))
      e.socialLink = "Enter a valid link (https://…)";
    if (!category) e.category = "Pick a content category";
    if (pitch.trim().length < 30) e.pitch = "Tell us a bit more (at least 30 characters)";
    if (!agree) e.agree = "Please agree to the guidelines to continue";
    return e;
  }

  async function onSubmit(ev) {
    ev.preventDefault();
    setErr("");
    const e = validate();
    setFieldErrors(e);
    if (Object.keys(e).length) {
      // Focus the first invalid field for accessibility.
      const first = document.querySelector('[aria-invalid="true"]');
      if (first) first.focus();
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/ambassador", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          country,
          platform,
          handle,
          socialLink,
          followers,
          category,
          referralSource,
          pitch,
          agree,
        }),
      });
      const data = await res.json().catch(() => ({}));
      setLoading(false);

      if (res.status === 409 && data.duplicate) {
        // An active application already exists — show its real status.
        setSubmitted(data.application || { status: "under_review" });
        return;
      }
      if (!res.ok) {
        setErr(data.error || "Could not submit your application. Try again.");
        return;
      }
      setSubmitted(
        data.application || { status: "under_review", submittedAt: new Date().toISOString() }
      );
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setLoading(false);
      setErr("Network error. Please try again.");
    }
  }

  // If the signed-in user already has an active application, or we just created
  // one, show the status card in place of the form.
  const statusApplication = submitted || existingApplication;
  const showStatus = Boolean(statusApplication);

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
              {showStatus ? "View my application →" : "Apply now →"}
            </a>
            <Link href="/#how" className="btn btn-ghost btn-lg">
              How PulseFy works
            </Link>
          </div>
        </div>
      </header>

      {/* BENEFITS */}
      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="tag">Why join</span>
            <h2>Why become a PulseFy Ambassador?</h2>
            <p>Real perks that grow with the community you build.</p>
          </div>
          <div className="features">
            {BENEFITS.map(([icon, title, body]) => (
              <div className="feature amb-feature" key={title}>
                <div className="feature-icon">{icon}</div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHO CAN APPLY */}
      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="tag">Who can apply</span>
            <h2>Who can become an Ambassador?</h2>
            <p>A few things we look for — no minimum follower count required.</p>
          </div>
          <div className="req-grid">
            {REQUIREMENTS.map((req) => (
              <div className="req-item" key={req}>
                <span className="req-check" aria-hidden="true">✓</span>
                <span>{req}</span>
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
            <h2>Four steps to get started</h2>
            <p>From application to earning, in a weekend.</p>
          </div>
          <div className="steps steps-4">
            {HOW_STEPS.map(([title, body], i) => (
              <div className="step" key={title}>
                <div className="step-num">{i + 1}</div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* APPLICATION FORM / STATUS */}
      <section className="section" id="apply">
        <div className="container">
          <div className="section-head">
            <span className="tag">{showStatus ? "Your application" : "Apply"}</span>
            <h2>{showStatus ? "Application status" : "Become an Ambassador"}</h2>
            <p>
              {showStatus
                ? "You've already applied — here's where things stand."
                : "Tell us about yourself. We review every application personally."}
            </p>
          </div>

          <div className="panel amb-panel">
            {showStatus ? (
              <StatusCard application={statusApplication} freshlySubmitted={Boolean(submitted)} />
            ) : (
              <form onSubmit={onSubmit} noValidate>
                {err && <div className="alert err">{err}</div>}

                <div className="field">
                  <label htmlFor="amb-name">Your name</label>
                  <input
                    id="amb-name"
                    type="text"
                    autoComplete="name"
                    placeholder="Sophie Martin"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    aria-invalid={fieldErrors.name ? "true" : undefined}
                    required
                  />
                  {fieldErrors.name && <span className="field-err">{fieldErrors.name}</span>}
                </div>

                <div className="amb-two-col">
                  <div className="field">
                    <label htmlFor="amb-email">Email</label>
                    <input
                      id="amb-email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      aria-invalid={fieldErrors.email ? "true" : undefined}
                      required
                    />
                    {fieldErrors.email && <span className="field-err">{fieldErrors.email}</span>}
                  </div>

                  <div className="field">
                    <label htmlFor="amb-country">Country / region</label>
                    <input
                      id="amb-country"
                      type="text"
                      autoComplete="country-name"
                      placeholder="United Kingdom"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      aria-invalid={fieldErrors.country ? "true" : undefined}
                      required
                    />
                    {fieldErrors.country && <span className="field-err">{fieldErrors.country}</span>}
                  </div>
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

                <div className="amb-two-col">
                  <div className="field">
                    <label htmlFor="amb-handle">Handle or channel</label>
                    <input
                      id="amb-handle"
                      type="text"
                      placeholder="@yourhandle"
                      value={handle}
                      onChange={(e) => setHandle(e.target.value)}
                      aria-invalid={fieldErrors.handle ? "true" : undefined}
                      required
                    />
                    {fieldErrors.handle && <span className="field-err">{fieldErrors.handle}</span>}
                  </div>

                  <div className="field">
                    <label htmlFor="amb-link">Social / profile link <span className="opt">(optional)</span></label>
                    <input
                      id="amb-link"
                      type="url"
                      inputMode="url"
                      placeholder="https://…"
                      value={socialLink}
                      onChange={(e) => setSocialLink(e.target.value)}
                      aria-invalid={fieldErrors.socialLink ? "true" : undefined}
                    />
                    {fieldErrors.socialLink && <span className="field-err">{fieldErrors.socialLink}</span>}
                  </div>
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

                <div className="amb-two-col">
                  <div className="field">
                    <label htmlFor="amb-category">Content category</label>
                    <select
                      id="amb-category"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      aria-invalid={fieldErrors.category ? "true" : undefined}
                      required
                    >
                      <option value="" disabled>Select a category…</option>
                      {CATEGORIES.map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                    {fieldErrors.category && <span className="field-err">{fieldErrors.category}</span>}
                  </div>

                  <div className="field">
                    <label htmlFor="amb-referral">How did you hear about PulseFy? <span className="opt">(optional)</span></label>
                    <select
                      id="amb-referral"
                      value={referralSource}
                      onChange={(e) => setReferralSource(e.target.value)}
                    >
                      <option value="">Select…</option>
                      {REFERRAL_SOURCES.map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
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
                    maxLength={2000}
                    aria-invalid={fieldErrors.pitch ? "true" : undefined}
                    required
                  />
                  {fieldErrors.pitch && <span className="field-err">{fieldErrors.pitch}</span>}
                </div>

                <div className="field">
                  <label className="checkbox-row amb-terms">
                    <input
                      type="checkbox"
                      checked={agree}
                      onChange={(e) => setAgree(e.target.checked)}
                      aria-invalid={fieldErrors.agree ? "true" : undefined}
                    />
                    <span>
                      I agree to the PulseFy Ambassador Program guidelines and community standards.
                    </span>
                  </label>
                  {fieldErrors.agree && <span className="field-err">{fieldErrors.agree}</span>}
                </div>

                <button className="btn btn-primary btn-block" disabled={loading}>
                  {loading ? "Submitting…" : "Submit application"}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
