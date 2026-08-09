export const dynamic = "force-dynamic";

import Link from "next/link";
import { auth } from "@/auth";
import Sidebar from "@/components/Sidebar";
import SubmitButton from "@/components/SubmitButton";
import { isAdminEmail } from "@/lib/admin";

export default async function ChallengePage({ params }) {
  const session = await auth();
  const user = session?.user;
  const challengeId = params.id;

  return (
    <div className="app">
      <Sidebar user={user} isAdmin={isAdminEmail(user?.email)} />

      <main className="main">
        <p className="breadcrumb">
          <Link href="/dashboard">Dashboard</Link> / Challenges / Summer Reels Sprint
        </p>

        {/* Hero card */}
        <div className="hero-card">
          <div className="hero-thumb" style={{ background: "linear-gradient(135deg,#ff7a45,#ffb43a)" }}>🎬</div>
          <div className="hc-body">
            <h1>
              Summer Reels Sprint{" "}
              <span className="status live" style={{ verticalAlign: "middle", marginLeft: 6 }}>Live</span>
            </h1>
            <div className="meta">
              <span>🎯 TikTok · Instagram</span>
              <span>📅 Jul 15 – Aug 15</span>
              <span>💸 $12,000 pool</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-ghost">Edit</button>
            <button className="btn btn-ghost">Review submissions</button>
          </div>
        </div>

        <div className="detail-grid">
          {/* Left column */}
          <div className="stack">
            <div className="panel">
              <div className="panel-head"><h3>Brief</h3></div>
              <p className="brief">
                Create a vibrant 15–30 second reel featuring our new summer collection. Show at least one product
                clearly, use bright outdoor lighting, and add trending audio. The caption must include the{" "}
                <b>#PulseFySummer</b> hashtag.
              </p>
              <div style={{ marginTop: 18 }}>
                <h4 style={{ fontSize: 14, marginBottom: 6 }}>Rules</h4>
                <ul className="rules">
                  <li>Video length 15–30 seconds</li>
                  <li>At least one product clearly visible</li>
                  <li>Caption includes #PulseFySummer</li>
                  <li>Original content — no reused footage</li>
                </ul>
              </div>
            </div>

            <div className="submit-cta">
              <div>
                <h3>Ready to enter?</h3>
                <p>Post your clip on TikTok, Instagram, YouTube or X, then drop the link here to join the challenge.</p>
              </div>
              <SubmitButton challengeId={challengeId} requiredCaption="#PulseFySummer" />
            </div>

            <div className="panel">
              <div className="panel-head"><h3>Recent submissions (642)</h3><a href="#">View all</a></div>
              <div className="sub-grid">
                {[
                  ["linear-gradient(135deg,#ff7a45,#a855f7)", "linear-gradient(135deg,#ffb43a,#ff7a45)", "A", "Ayesha R.", "42k views", "3.1k"],
                  ["linear-gradient(135deg,#a855f7,#38e8c8)", "linear-gradient(135deg,#a855f7,#38e8c8)", "R", "Rafi Ahmed", "28k views", "2.4k"],
                  ["linear-gradient(135deg,#ffb43a,#f4526a)", "linear-gradient(135deg,#ffb43a,#f4526a)", "T", "Tania Khan", "61k views", "5.8k"],
                ].map(([media, av, ini, name, views, likes], i) => (
                  <div className="sub-card" key={i}>
                    <div className="sub-media" style={{ background: media }}>🎥</div>
                    <div className="sub-info">
                      <Link href="/creator/ayesha-rahman" className="u">
                        <span className="av" style={{ background: av }}>{ini}</span><b>{name}</b>
                      </Link>
                      <div className="row"><span>👁️ {views}</span><span>❤️ {likes}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right column */}
          <div className="stack">
            <div className="panel">
              <div className="panel-head"><h3>Stats</h3></div>
              <ul className="info-list">
                <li><span>Total submissions</span><b>642</b></li>
                <li><span>Approved</span><b>462</b></li>
                <li><span>In review</span><b>180</b></li>
                <li><span>Total views</span><b>2.4M</b></li>
                <li><span>Clean score</span><b style={{ color: "var(--ok)" }}>86%</b></li>
                <li><span>Progress</span><b>72%</b></li>
              </ul>
            </div>
            <div className="panel">
              <div className="panel-head"><h3>Reward breakdown</h3></div>
              <ul className="info-list">
                <li><span>🥇 1st place</span><b>$5,000</b></li>
                <li><span>🥈 2nd place</span><b>$3,000</b></li>
                <li><span>🥉 3rd place</span><b>$2,000</b></li>
                <li><span>🎁 Participation (20)</span><b>$100 each</b></li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
