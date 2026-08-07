export const dynamic = "force-dynamic";

import Link from "next/link";
import { auth } from "@/auth";
import Navbar from "@/components/Navbar";
import Reveal from "@/components/Reveal";

export default async function Home() {
  const session = await auth();
  const cta = session ? "/dashboard" : "/signup";
  const creatorCta = session ? "/dashboard" : "/signup?role=creator";
  const brandCta = session ? "/dashboard" : "/signup?role=brand";

  return (
    <>
      <Navbar session={session} />

      {/* HERO */}
      <header className="hero">
        <div className="container">
          <span className="pill">
            <span className="dot"></span> Trusted by 100+ brands worldwide
          </span>
          <h1>
            Infrastructure for the
            <br />
            <span className="grad">AI Creator Economy</span>
          </h1>
          <p className="sub">
            Launch content challenges at scale. Thousands of creators submit, AI
            filters what&apos;s on-brand, and rewards flow automatically — from
            brief to payout.
          </p>
          <div className="hero-actions">
            <Link href={creatorCta} className="btn btn-primary btn-lg">
              Start Creating →
            </Link>
            <Link href={brandCta} className="btn btn-ghost btn-lg">
              Start a Campaign →
            </Link>
          </div>
          <p className="hero-note">No credit card required · Set up in minutes</p>

          <div className="trusted">
            <p>Powering campaigns for</p>
            <div className="trusted-row">
              <span>Nebula</span>
              <span>Vertex</span>
              <span>Loom&amp;Co</span>
              <span>Fizzr</span>
              <span>Kairo</span>
              <span>Pulse</span>
            </div>
          </div>
        </div>
      </header>

      {/* HOW IT WORKS */}
      <section className="section" id="how">
        <div className="container">
          <Reveal className="section-head">
            <span className="tag">How it works</span>
            <h2>Three steps. Zero chaos.</h2>
            <p>Everything from setup to global payout, handled in one place.</p>
          </Reveal>
          <div className="steps">
            <Reveal className="step">
              <div className="step-num">1</div>
              <h3>Set</h3>
              <p>
                Create a challenge, define the brief, rules, and rewards. Make it
                open to all or invite-only for a vetted creator pool.
              </p>
            </Reveal>
            <Reveal className="step">
              <div className="step-num">2</div>
              <h3>Review</h3>
              <p>
                AI filters off-brief submissions and surfaces the content worth
                approving. You approve what&apos;s on-brand in one click.
              </p>
            </Reveal>
            <Reveal className="step">
              <div className="step-num">3</div>
              <h3>Run</h3>
              <p>
                Results roll in across every platform and rewards pay out
                automatically — in fiat or USDC, worldwide.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="section" id="features">
        <div className="container">
          <Reveal className="section-head">
            <span className="tag">Features</span>
            <h2>The infrastructure layer</h2>
            <p>
              Not a marketplace — the tools to build and scale your own creator
              ecosystem.
            </p>
          </Reveal>
          <div className="features">
            {[
              ["🌍", "Automated global payouts", "Pay creators anywhere in fiat or USDC. One invoice. Full compliance. Zero manual work."],
              ["📊", "Cross-platform tracking", "TikTok, Instagram, YouTube, X, Reddit, Facebook & LinkedIn — all in one dashboard."],
              ["🤖", "Anti-bot protection", "A Clean Engagement Score with real-time AI scanning flags fake engagement instantly."],
              ["🔒", "Tiered creator access", "Open or invite-only challenges with gated, brand-approved creator pools."],
              ["✨", "AI moderation", "Filters off-brief submissions and surfaces the content that's genuinely worth approving."],
              ["🔧", "API & white-label", "Embed the whole engine into your own platform with a full SDK and white-label options."],
            ].map(([icon, title, body], i) => (
              <Reveal className="feature" key={i}>
                <div className="feature-icon">{icon}</div>
                <h3>{title}</h3>
                <p>{body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="section">
        <div className="container">
          <Reveal className="stats-band">
            <div className="stat"><div className="big">36x</div><div className="lbl">More engagement per dollar</div></div>
            <div className="stat"><div className="big">100+</div><div className="lbl">Brands trust Pulsefy</div></div>
            <div className="stat"><div className="big">50k+</div><div className="lbl">Creators paid out</div></div>
            <div className="stat"><div className="big">7</div><div className="lbl">Platforms tracked</div></div>
          </Reveal>
        </div>
      </section>

      {/* PRICING */}
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

      {/* CTA */}
      <section className="section">
        <div className="container">
          <Reveal className="cta-band">
            <h2>Ready to launch your first challenge?</h2>
            <p>Join 100+ brands scaling creator campaigns without the chaos.</p>
            <Link href={cta} className="btn btn-primary btn-lg">Start free →</Link>
          </Reveal>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="container">
          <div className="footer-grid">
            <div className="footer-brand">
              <Link href="/" className="logo"><span className="logo-mark" aria-hidden="true" /> Pulsefy</Link>
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
            <span>© 2026 Pulsefy. All rights reserved.</span>
            <span>Made for creators &amp; brands.</span>
          </div>
        </div>
      </footer>
    </>
  );
}
