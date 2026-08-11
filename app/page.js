export const dynamic = "force-dynamic";

import Link from "next/link";
import { auth } from "@/auth";
import Navbar from "@/components/Navbar";
import Reveal from "@/components/Reveal";
import VerifiedBadge from "@/components/VerifiedBadge";
import HeroActivity from "@/components/landing/HeroActivity";
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
  ["🎬", "Creators submit", "Creators post to TikTok, Instagram, YouTube, X and more, then submit their clip."],
  ["🤖", "AI + human review", "AI filters off-brief submissions and surfaces the content genuinely worth approving."],
  ["✅", "Approve on-brand", "The brand approves what fits in one click — no spreadsheets, no chasing."],
  ["💸", "Automatic payout", "Rewards flow to creators in fiat or USDC, anywhere in the world."],
];

const LEVELS = [
  ["🌱", "New", "You've joined and made your first submissions."],
  ["📈", "Rising", "Approved work is stacking up and your Pulse Score is climbing."],
  ["⚡", "Pro", "A consistent, reliable creator that brands recognise."],
  ["💎", "Elite", "Top-tier output and approval rate across campaigns."],
  ["★", "Ambassador", "Represent PulseFy through the Ambassador Program."],
];

const FEATURES = [
  ["🌍", "Automated global payouts", "Pay creators anywhere in fiat or USDC. One invoice. Full compliance. Zero manual work."],
  ["📊", "Cross-platform tracking", "TikTok, Instagram, YouTube, X, Reddit, Facebook & LinkedIn — all in one dashboard."],
  ["🤖", "Anti-bot protection", "A Clean Engagement Score with real-time AI scanning flags fake engagement instantly."],
  ["🔒", "Tiered creator access", "Open or invite-only challenges with gated, brand-approved creator pools."],
  ["✨", "AI moderation", "Filters off-brief submissions and surfaces the content that's genuinely worth approving."],
  ["🔧", "API & white-label", "Embed the whole engine into your own platform with a full SDK and white-label options."],
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
          <span className="pill">
            <span className="dot"></span> A live operating system for the creator economy
          </span>
          <h1>
            The creator economy,
            <br />
            from <span className="grad">brief to payout</span>.
          </h1>
          <p className="sub">
            Brands launch campaigns. Thousands of creators submit. AI filters
            what&apos;s on-brand, humans approve, and rewards pay out
            automatically — worldwide.
          </p>
          <div className="hero-actions">
            <Link href={startCreating} className="btn btn-primary btn-lg">
              Start Creating →
            </Link>
            <Link href={startCampaign} className="btn btn-ghost btn-lg">
              Start a Campaign →
            </Link>
          </div>
          <p className="hero-note">No credit card required · Set up in minutes</p>

          <div className="hero-pipeline" aria-label="How value flows through PulseFy">
            {["Brands", "Campaigns", "Creators", "AI review", "Approval", "Payout"].map((s, i, a) => (
              <span className="hp-node" key={s}>
                {s}
                {i < a.length - 1 ? <i className="hp-arrow" aria-hidden="true">→</i> : null}
              </span>
            ))}
          </div>
        </div>

        <HeroActivity items={activity} />
      </header>

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
            <p>Real people turning content into income across every major platform.</p>
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
                honest signal built from your approved work, approval rate,
                ratings and verification. It grows as you create, and brands use
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

      {/* ============== CREATOR LEVELS (informational) ============== */}
      <section className="section">
        <div className="container">
          <Reveal className="section-head">
            <span className="tag">Creator Levels</span>
            <h2>A path that grows with you.</h2>
            <p>As your approved work and Pulse Score grow, so does your standing on PulseFy.</p>
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
          <div className="features">
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

      {/* ============== SOCIAL PROOF — REAL platform stats ============== */}
      {hasData ? (
        <section className="section">
          <div className="container">
            <Reveal className="stats-band stats-band-v2">
              <StatCounter value={stats.creators} label="Creators on PulseFy" />
              <StatCounter value={stats.activeCampaigns} label="Live campaigns" />
              <StatCounter value={stats.paidOut} prefix="$" label="Paid to creators" />
              <StatCounter value={7} label="Platforms tracked" />
            </Reveal>
          </div>
        </section>
      ) : null}

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
            <h2>Start free. Scale when ready.</h2>
            <p>No hidden fees. Pay only when your creators earn.</p>
          </Reveal>
          <div className="pricing">
            <Reveal className="price-card">
              <h3>Starter</h3>
              <p className="desc">For your first campaigns</p>
              <div className="price-amt"><span className="num">$0</span><span className="per">/month</span></div>
              <p className="price-fee">+ 20% platform fee on creator rewards</p>
              <ul className="price-list">
                <li>Unlimited challenges</li>
                <li>Cross-platform tracking</li>
                <li>AI moderation</li>
                <li>Global payouts</li>
              </ul>
              <Link href={cta} className="btn btn-ghost btn-block">Get started</Link>
            </Reveal>
            <Reveal className="price-card featured">
              <span className="price-badge">Most popular</span>
              <h3>Pro</h3>
              <p className="desc">For teams running many campaigns</p>
              <div className="price-amt"><span className="num">$280</span><span className="per">/month</span></div>
              <p className="price-fee">+ 18% platform fee on creator rewards</p>
              <ul className="price-list">
                <li>Everything in Starter</li>
                <li>Team seats &amp; roles</li>
                <li>Advanced analytics</li>
                <li>Clean Engagement Score</li>
                <li>Priority support</li>
              </ul>
              <Link href={cta} className="btn btn-primary btn-block">Start Pro trial</Link>
            </Reveal>
            <Reveal className="price-card">
              <h3>Enterprise</h3>
              <p className="desc">For scaled creator ecosystems</p>
              <div className="price-amt"><span className="num">Custom</span></div>
              <p className="price-fee">Reduced 15% fee</p>
              <ul className="price-list">
                <li>Everything in Pro</li>
                <li>White-label</li>
                <li>API &amp; SDK access</li>
                <li>Dedicated manager</li>
                <li>Custom compliance</li>
              </ul>
              <a href="#" className="btn btn-ghost btn-block">Contact sales</a>
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
              <p>Infrastructure for the AI creator economy. From brief to payout — automated.</p>
            </div>
            <div className="footer-col">
              <h4>Product</h4>
              <a href="#features">Features</a>
              <a href="#pricing">Pricing</a>
              <Link href="/dashboard">Dashboard</Link>
              <a href="#">API docs</a>
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
              <a href="#">Compliance</a>
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
