export const dynamic = "force-dynamic";

import Link from "next/link";
import { auth } from "@/auth";
import Navbar from "@/components/Navbar";
import Reveal from "@/components/Reveal";
import VerifiedBadge from "@/components/VerifiedBadge";
import HeroOrbit from "@/components/landing/HeroOrbit";
import PulseScore from "@/components/landing/PulseScore";
import StatCounter from "@/components/landing/StatCounter";
import { getLandingData } from "@/lib/landing";

const PLATFORM = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
  x: "X",
  reddit: "Reddit",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  any: "Multi-platform",
};
const platformLabel = (p) => PLATFORM[String(p || "").toLowerCase()] || "Multi-platform";

const CONTENT_TYPE = { ugc: "UGC", edit: "Edit", ai: "AI", open: "Open format" };

function initials(name) {
  const n = String(name || "").trim();
  if (!n) return "•";
  return n.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

// Landing-only avatar. Uses the `lx-` prefixed classes so it never collides
// with the dashboard/leaderboard `.avatar` / `.cc-av` styles.
function Avatar({ name, image, className = "" }) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={`lx-av ${className}`.trim()} src={image} alt="" />;
  }
  return <span className={`lx-av lx-av-fallback ${className}`.trim()}>{initials(name)}</span>;
}

const FLOW = [
  ["📝", "Post a brief", "A brand defines the campaign, rules and reward — open to all or an invite-only creator pool."],
  ["🎬", "Creators submit", "Creators post to TikTok, Instagram, YouTube or X, then submit their clip."],
  ["🔍", "Human review", "Every submission is checked by a real person — off-brief content is filtered out before approval."],
  ["✅", "Approve on-brand", "The brand approves what fits in one click — no spreadsheets, no chasing."],
  ["💸", "Global payout", "Approved creators get paid in USDC or to their bank / PayPal — anywhere in the world."],
];

const LEVELS = [
  ["🌱", "Start free", "Join as a creator and make your first submissions — no cost to begin."],
  ["✅", "Earn approvals", "Every approved submission builds your track record and pays out."],
  ["💬", "Get rated", "Brands review your work, and strong ratings lift your Pulse Score."],
  ["💎", "Get verified", "Verification and a high Pulse Score help brands trust you faster."],
  ["★", "Ambassador", "Represent PulseFy through the Ambassador Program."],
];

const FEATURES = [
  ["🌍", "Global payouts", "Pay creators anywhere — in USDC or to their bank / PayPal — without wiring each one yourself."],
  ["📊", "Cross-platform tracking", "TikTok, Instagram, YouTube and X — all in one dashboard."],
  ["🛡️", "Verified metrics", "Views and engagement are real numbers — auto-fetched from the YouTube API where available and confirmed by a human reviewer, never invented."],
  ["🔒", "Tiered creator access", "Open or invite-only challenges with gated, brand-approved creator pools."],
  ["✨", "Human moderation", "Every submission is reviewed by a real person, so only on-brief, on-brand content gets approved."],
  ["📈", "Campaign analytics", "Track views, engagement, spend and your top creators across every campaign — from one dashboard."],
];

export default async function Home() {
  const session = await auth();
  const loggedIn = !!session?.user?.id;

  const { stats, creators, campaigns, activity, hasData } = await getLandingData();

  // Session-aware destinations. Creator profiles, campaign detail and the
  // dashboard all live behind auth, so a logged-out visitor is funnelled to
  // sign-up (the intended path) rather than bounced to /login by middleware.
  const cta = loggedIn ? "/dashboard" : "/signup";
  const startCreating = loggedIn ? "/dashboard" : "/signup?role=creator";
  const startCampaign = loggedIn ? "/dashboard" : "/signup?role=brand";
  const exploreCampaigns = loggedIn ? "/dashboard/campaigns" : "/signup?role=creator";
  const creatorHref = (id) => (loggedIn ? `/creator/${id}` : "/signup?role=creator");
  const campaignHref = (id) => (loggedIn ? `/dashboard/campaigns/${id}` : "/signup?role=creator");

  return (
    <>
      <Navbar session={session} />

      {/* ===================== HERO ===================== */}
      <header className="hero hero-v2">
        <div className="container">
          <div className="hero-grid">
            <div className="hero-copy">
              <span className="pill">
                <span className="dot"></span> A live operating system for the creator economy
              </span>
              <h1>
                The creator economy,
                <br />
                from <span className="grad">brief to payout</span>.
              </h1>
              <p className="sub">
                Brands launch campaigns. Creators submit their best work.
                A real person reviews what&apos;s on-brand, brands approve,
                and creators get paid — worldwide.
              </p>
              <div className="hero-actions">
                <Link href={startCreating} className="btn btn-primary btn-lg">
                  Start Creating →
                </Link>
                <Link href={startCampaign} className="btn btn-green btn-lg">
                  Start a Campaign →
                </Link>
              </div>
              <p className="hero-note">No credit card required · Set up in minutes</p>

              {hasData ? (
                <div className="hero-stats">
                  <StatCounter value={stats.creators} label="Creators on PulseFy" />
                  <StatCounter value={stats.activeCampaigns} label="Live campaigns" />
                  <StatCounter value={stats.paidOut} prefix="$" label="Paid to creators" />
                  <StatCounter value={4} label="Platforms tracked" />
                </div>
              ) : null}
            </div>

            <div className="hero-visual">
              <HeroOrbit activity={activity} />
            </div>
          </div>

          <div className="hero-pipeline" aria-label="How value flows through PulseFy">
            {["Brands", "Campaigns", "Creators", "Review", "Approval", "Payout"].map((s, i, a) => (
              <span className="hp-node" key={s}>
                {s}
                {i < a.length - 1 ? <i className="hp-arrow" aria-hidden="true">→</i> : null}
              </span>
            ))}
          </div>
        </div>
      </header>

      {/* ============== WORKS WITH (real platforms) ============== */}
      <section className="works" aria-label="Supported platforms">
        <div className="container">
          <Reveal>
            <p className="works-label">Works with the platforms your creators already use</p>
            <div className="works-row">
              {["TikTok", "Instagram", "YouTube", "X"].map((p) => (
                <span className="works-chip" key={p}>
                  <span className="works-dot" aria-hidden="true" />
                  {p}
                </span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============== FOR BRANDS / FOR CREATORS ============== */}
      <section className="section promo-section">
        <div className="container">
          <div className="promo-2">
            {/* ---- For Brands (green) ---- */}
            <Reveal as="article" className="promo-card promo-brands" id="brands">
              <span className="promo-art" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 11v2a1 1 0 0 0 1 1h2l3.5 3.3a1 1 0 0 0 1.7-.73V7.43a1 1 0 0 0-1.7-.72L6 10H4a1 1 0 0 0-1 1Z" />
                  <path d="M15 8.5a4 4 0 0 1 0 7" />
                  <path d="M7 15v3a1.5 1.5 0 0 0 3 0v-1.5" />
                </svg>
              </span>
              <span className="promo-eyebrow">For Brands</span>
              <h3>Launch campaigns in minutes.</h3>
              <p>
                Brief once, reach creators you can vet by Pulse Score and reviews,
                and pay only for approved, on-brand content — with global payouts
                handled for you.
              </p>
              <div className="promo-actions">
                <Link href={startCampaign} className="btn btn-green btn-lg">Start a Campaign →</Link>
              </div>
            </Reveal>

            {/* ---- For Creators (orange) ---- */}
            <Reveal as="article" className="promo-card promo-creators" id="creators">
              <span className="promo-art" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20.3S4.2 16 4.2 10.4A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7.8 2.4C19.8 16 12 20.3 12 20.3Z" />
                  <path d="M10.7 9.9l3 1.8-3 1.8V9.9Z" fill="currentColor" stroke="none" />
                </svg>
              </span>
              <span className="promo-eyebrow">For Creators</span>
              <h3>Get paid for the content you make.</h3>
              <p>
                Browse live campaigns, submit your best work, and cash out in USDC
                or to your bank / PayPal — building a Pulse Score that brands trust.
              </p>
              <div className="promo-actions">
                <Link href={startCreating} className="btn btn-primary btn-lg">Start Creating →</Link>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ============== FROM BRIEF TO PAYOUT (#how) ============== */}
      <section className="section workflow-section" id="how">
        <div className="container">
          <Reveal className="section-head">
            <span className="tag">How it works</span>
            <h2>From brief to payout.</h2>
            <p>Everything from setup to global payout, handled in one connected flow.</p>
          </Reveal>
          <ol className="workflow">
            {FLOW.map(([icon, title, body], i) => (
              <Reveal as="li" className="wf-step" key={title}>
                <span className="wf-dot">{i + 1}</span>
                <div className="wf-icon">{icon}</div>
                <h3>{title}</h3>
                <p>{body}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ============== CREATOR SUCCESS STORIES ============== */}
      <section className="section">
        <div className="container">
          <Reveal className="section-head">
            <span className="tag">Creators</span>
            <h2>Creators are building with PulseFy.</h2>
            <p>Real people turning content into income across TikTok, Instagram, YouTube and X.</p>
          </Reveal>

          {creators.length ? (
            <Reveal className="lx-creators">
              {creators.map((c) => (
                <Link href={creatorHref(c.id)} className="lx-ccard" key={c.id}>
                  <div className="lx-ccard-head">
                    <Avatar name={c.name} image={c.image} className="lx-cc-av" />
                    <div className="lx-ccard-id">
                      <span className="lx-ccard-name">
                        {c.name}
                        <VerifiedBadge verified={c.isVerified} />
                      </span>
                      {c.username ? <span className="lx-ccard-user">@{c.username}</span> : null}
                    </div>
                  </div>
                  {c.bio ? <p className="lx-ccard-quote">“{c.bio}”</p> : null}
                  <div className="lx-ccard-stats">
                    <div className="lx-ccard-stat">
                      <span className="lx-ccard-n">${c.earnings.toLocaleString("en-US")}</span>
                      <span className="lx-ccard-l">Earned</span>
                    </div>
                    <div className="lx-ccard-stat">
                      <span className="lx-ccard-n">{c.approved.toLocaleString("en-US")}</span>
                      <span className="lx-ccard-l">Approved</span>
                    </div>
                    {c.approvalRate != null ? (
                      <div className="lx-ccard-stat">
                        <span className="lx-ccard-n">{c.approvalRate}%</span>
                        <span className="lx-ccard-l">Approval</span>
                      </div>
                    ) : null}
                  </div>
                  <span className="lx-ccard-view">View profile →</span>
                </Link>
              ))}
            </Reveal>
          ) : (
            <Reveal className="lx-empty">
              <div className="lx-empty-emoji" aria-hidden="true">🚀</div>
              <h3>The first creators are just getting started.</h3>
              <p>Be one of the early creators building a track record on PulseFy.</p>
              <Link href={startCreating} className="btn btn-primary btn-lg">Start Creating →</Link>
            </Reveal>
          )}
        </div>
      </section>

      {/* ============== LIVE CAMPAIGNS ============== */}
      <section className="section">
        <div className="container">
          <Reveal className="section-head">
            <span className="tag">Opportunities</span>
            <h2>Opportunities are live.</h2>
            <p>Active campaigns from brands, open for creators to submit to right now.</p>
          </Reveal>

          {campaigns.length ? (
            <>
              <Reveal className="lx-camps">
                {campaigns.map((c) => (
                  <Link href={campaignHref(c.id)} className="lx-ccamp" key={c.id}>
                    <div
                      className="lx-ccamp-thumb"
                      style={c.thumbnailUrl ? { backgroundImage: `url(${c.thumbnailUrl})` } : undefined}
                    >
                      {!c.thumbnailUrl ? <span className="lx-ccamp-tf">{initials(c.title)}</span> : null}
                      <span className="lx-ccamp-live">● Live</span>
                    </div>
                    <div className="lx-ccamp-body">
                      <h3 className="lx-ccamp-title">{c.title}</h3>
                      <div className="lx-ccamp-brand">
                        by {c.brandName}
                        <VerifiedBadge verified={c.brandVerified} />
                      </div>
                      <div className="lx-ccamp-tags">
                        <span className="lx-ccamp-tag">{platformLabel(c.platform)}</span>
                        {c.contentType && CONTENT_TYPE[c.contentType] ? (
                          <span className="lx-ccamp-tag">{CONTENT_TYPE[c.contentType]}</span>
                        ) : null}
                      </div>
                      <div className="lx-ccamp-foot">
                        <span className="lx-ccamp-reward">${c.reward.toLocaleString("en-US")} <i>/ post</i></span>
                        <span className="lx-ccamp-subs">{c.submissionCount.toLocaleString("en-US")} submitted</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </Reveal>
              <div className="lx-section-cta">
                <Link href={exploreCampaigns} className="btn btn-ghost btn-lg">View all campaigns →</Link>
              </div>
            </>
          ) : (
            <Reveal className="lx-empty">
              <div className="lx-empty-emoji" aria-hidden="true">🎯</div>
              <h3>No live campaigns just yet.</h3>
              <p>New campaigns open regularly. Create an account to be first when they go live.</p>
              <Link href={startCreating} className="btn btn-primary btn-lg">Get notified →</Link>
            </Reveal>
          )}
        </div>
      </section>

      {/* ============== CREATOR PULSE (signature) ============== */}
      <section className="section pulse-section">
        <div className="container">
          <div className="pulse-grid">
            <Reveal className="pulse-copy">
              <span className="tag">Creator Pulse</span>
              <h2>Your reputation, scored.</h2>
              <p>
                Every creator earns a <strong>Pulse Score</strong> — a single,
                honest signal built from your approved work, ratings and
                verification. It grows as you create, and brands use
                it to trust you faster.
              </p>
              <ul className="pulse-points">
                <li>Rewards real, completed work — not follower counts.</li>
                <li>Verification and consistent approvals lift your score.</li>
                <li>Transparent factors, no black box.</li>
              </ul>
              <Link href={startCreating} className="btn btn-primary btn-lg">Build your Pulse →</Link>
            </Reveal>
            <Reveal className="pulse-visual">
              <PulseScore sample={82} />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ============== CREATOR GROWTH (informational) ============== */}
      <section className="section">
        <div className="container">
          <Reveal className="section-head">
            <span className="tag">Creator growth</span>
            <h2>A path that grows with you.</h2>
            <p>Start free, earn approvals, and build a Pulse Score that brands trust.</p>
          </Reveal>
          <Reveal className="levels">
            {LEVELS.map(([icon, name, note], i) => {
              const isAmb = name === "Ambassador";
              const inner = (
                <>
                  <span className="lv-badge">{icon}</span>
                  <span className="lv-name">{name}</span>
                  <span className="lv-note">{note}</span>
                  {isAmb ? <span className="lv-link">Apply →</span> : null}
                </>
              );
              return isAmb ? (
                <Link href="/ambassador" className="level level-amb" key={name}>{inner}</Link>
              ) : (
                <div className={`level lv-${i}`} key={name}>{inner}</div>
              );
            })}
          </Reveal>
        </div>
      </section>

      {/* ============== LIVE PLATFORM ACTIVITY (real, else hidden) ============== */}
      {activity.length ? (
        <section className="section activity-section">
          <div className="container">
            <Reveal className="section-head">
              <span className="tag">Live activity</span>
              <h2>The platform is moving.</h2>
              <p>Recent approved work from creators across live campaigns.</p>
            </Reveal>
            <Reveal className="activity-feed">
              {activity.slice(0, 6).map((a, i) => (
                <div className="af-row" key={i}>
                  <Avatar name={a.creatorName} image={a.creatorImage} className="lx-af-av" />
                  <div className="af-main">
                    <span className="af-name">
                      {a.creatorName}
                      <VerifiedBadge verified={a.creatorVerified} />
                    </span>
                    <span className="af-text">
                      earned <strong>${a.reward.toLocaleString("en-US")}</strong> on{" "}
                      <span className="af-camp">{a.campaignTitle}</span>
                    </span>
                  </div>
                  <span className="af-plat">{platformLabel(a.platform)}</span>
                </div>
              ))}
            </Reveal>
          </div>
        </section>
      ) : null}

      {/* ============== FEATURES (#features) ============== */}
      <section className="section" id="features">
        <div className="container">
          <Reveal className="section-head">
            <span className="tag">Features</span>
            <h2>The infrastructure layer</h2>
            <p>Not a marketplace — the tools to build and scale your own creator ecosystem.</p>
          </Reveal>
          <div className="features why-choose">
            {FEATURES.map(([icon, title, body]) => (
              <Reveal className="feature" key={title}>
                <div className="feature-icon">{icon}</div>
                <h3>{title}</h3>
                <p>{body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============== AMBASSADOR PROGRAM ============== */}
      <section className="section">
        <div className="container">
          <Reveal className="amb-band">
            <div className="amb-band-glow" aria-hidden="true" />
            <div className="amb-band-content">
              <span className="amb-band-star" aria-hidden="true">★</span>
              <h2>Become a PulseFy Ambassador.</h2>
              <p>
                Love the platform? Join the Ambassador Program, help creators grow,
                and represent PulseFy in your community.
              </p>
              <Link href="/ambassador" className="btn btn-ambassador btn-lg">
                <span className="amb-star" aria-hidden="true">★</span>
                Explore the program
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============== PRICING (#pricing) ============== */}
      <section className="section" id="pricing">
        <div className="container">
          <Reveal className="section-head">
            <span className="tag">Pricing</span>
            <h2>Free to start.</h2>
            <p>No subscription, and no platform cut of creator rewards. Brands fund campaigns as they go.</p>
          </Reveal>
          <div className="pricing-solo">
            <Reveal className="price-solo">
              <div className="price-solo-main">
                <div className="price-amt"><span className="num">$0</span><span className="per">to start</span></div>
                <p className="price-solo-tag">Sign up free — brands and creators both start here.</p>
                <ul className="price-model">
                  <li>Brands top up a wallet to fund campaign rewards.</li>
                  <li>Creators keep <strong>100%</strong> of every approved reward.</li>
                  <li>A flat <strong>5%</strong> fee applies only when a creator withdraws.</li>
                </ul>
                <Link href={cta} className="btn btn-primary btn-lg">Get started</Link>
              </div>
              <div className="price-solo-side">
                <span className="price-side-label">Included, live today</span>
                <ul className="price-list">
                  <li>Unlimited challenges</li>
                  <li>Cross-platform tracking</li>
                  <li>Human review</li>
                  <li>Global payouts — USDC or bank / PayPal</li>
                  <li>Creator Pulse Scores</li>
                  <li>Campaign analytics</li>
                </ul>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ============== FINAL CTA ============== */}
      <section className="section">
        <div className="container">
          <Reveal className="cta-band final-cta">
            <h2>Your next opportunity is already here.</h2>
            <p>Join the creators and brands building on PulseFy — from brief to payout.</p>
            <div className="final-cta-actions">
              <Link href={startCreating} className="btn btn-primary btn-lg">Start Creating →</Link>
              <Link href={exploreCampaigns} className="btn btn-ghost btn-lg">Explore Campaigns →</Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============== FOOTER ============== */}
      <footer className="footer">
        <div className="container">
          <div className="footer-grid">
            <div className="footer-brand">
              <Link href="/" className="logo"><span className="logo-mark" aria-hidden="true" /><span className="wordmark">Pulse<span className="wm-fy">Fy</span></span></Link>
              <p>Infrastructure for the creator economy. From brief to payout, in one place.</p>
              <div className="footer-social">
                <a href="#" aria-label="PulseFy on X">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.53 3h3.02l-6.6 7.54L21.75 21h-6.06l-4.75-6.2L5.5 21H2.47l7.06-8.07L2.25 3h6.21l4.29 5.67L17.53 3Zm-1.06 16.2h1.67L7.6 4.71H5.8l10.67 14.49Z" /></svg>
                </a>
                <a href="#" aria-label="PulseFy on Instagram">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.2c3.2 0 3.6 0 4.85.07 1.17.05 1.8.25 2.23.42.56.22.96.48 1.38.9.42.42.68.82.9 1.38.17.42.37 1.06.42 2.23.06 1.26.07 1.64.07 4.83s0 3.57-.07 4.83c-.05 1.17-.25 1.8-.42 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.17-1.06.37-2.23.42-1.26.06-1.64.07-4.85.07s-3.59 0-4.85-.07c-1.17-.05-1.8-.25-2.23-.42a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.17-.42-.37-1.06-.42-2.23C2.2 15.57 2.2 15.19 2.2 12s0-3.57.07-4.83c.05-1.17.25-1.8.42-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.17 1.06-.37 2.23-.42C8.41 2.2 8.79 2.2 12 2.2Zm0 1.8c-3.14 0-3.5 0-4.74.07-.9.04-1.38.19-1.7.32-.43.17-.74.37-1.06.69-.32.32-.52.63-.69 1.06-.13.32-.28.8-.32 1.7C3.4 8.5 3.4 8.86 3.4 12s0 3.5.07 4.74c.04.9.19 1.38.32 1.7.17.43.37.74.69 1.06.32.32.63.52 1.06.69.32.13.8.28 1.7.32 1.24.07 1.6.07 4.74.07s3.5 0 4.74-.07c.9-.04 1.38-.19 1.7-.32.43-.17.74-.37 1.06-.69.32-.32.52-.63.69-1.06.13-.32.28-.8.32-1.7.07-1.24.07-1.6.07-4.74s0-3.5-.07-4.74c-.04-.9-.19-1.38-.32-1.7a2.9 2.9 0 0 0-.69-1.06 2.9 2.9 0 0 0-1.06-.69c-.32-.13-.8-.28-1.7-.32C15.5 4 15.14 4 12 4Zm0 3.06A4.94 4.94 0 1 1 7.06 12 4.94 4.94 0 0 1 12 7.06Zm0 1.8A3.14 3.14 0 1 0 15.14 12 3.14 3.14 0 0 0 12 8.86Zm5.14-.66a1.15 1.15 0 1 1-1.15 1.15 1.15 1.15 0 0 1 1.15-1.15Z" /></svg>
                </a>
                <a href="#" aria-label="PulseFy on YouTube">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M23.5 6.5a3 3 0 0 0-2.1-2.1C19.5 3.9 12 3.9 12 3.9s-7.5 0-9.4.5A3 3 0 0 0 .5 6.5 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.5 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.5ZM9.6 15.6V8.4l6.2 3.6-6.2 3.6Z" /></svg>
                </a>
                <a href="#" aria-label="PulseFy on TikTok">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.6 5.82a4.28 4.28 0 0 1-1.06-2.82h-3.2v12.86a2.59 2.59 0 1 1-2.59-2.59c.27 0 .53.04.77.12V9.13a5.87 5.87 0 0 0-.77-.05 5.86 5.86 0 1 0 5.86 5.86V9.01a7.44 7.44 0 0 0 4.35 1.39V7.2a4.28 4.28 0 0 1-3.36-1.38Z" /></svg>
                </a>
                <a href="#" aria-label="PulseFy on LinkedIn">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14Zm1.78 13.02H3.56V9h3.56v11.45ZM22.22 0H1.77C.8 0 0 .78 0 1.73v20.53C0 23.22.8 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.74V1.73C24 .78 23.2 0 22.22 0Z" /></svg>
                </a>
              </div>
            </div>
            <div className="footer-col">
              <h4>Product</h4>
              <a href="#features">Features</a>
              <a href="#pricing">Pricing</a>
              <Link href="/dashboard">Dashboard</Link>
            </div>
            <div className="footer-col">
              <h4>Company</h4>
              <a href="#">About</a>
              <a href="#">Blog</a>
              <a href="#">Careers</a>
              <a href="#">Contact</a>
            </div>
            <div className="footer-col">
              <h4>Legal</h4>
              <a href="#">Privacy</a>
              <a href="#">Terms</a>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© 2026 PulseFy. All rights reserved.</span>
            <span>Made for creators &amp; brands.</span>
          </div>
        </div>
      </footer>
    </>
  );
}
