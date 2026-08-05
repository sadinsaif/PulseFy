import Link from "next/link";
import { auth } from "@/auth";
import Sidebar from "@/components/Sidebar";

export default async function CreatorPage({ params }) {
  const session = await auth();
  const user = session?.user;

  return (
    <div className="app">
      <Sidebar user={user} />

      <main className="main">
        <p className="breadcrumb">
          <Link href="/dashboard">Dashboard</Link> / Creators / Ayesha Rahman
        </p>

        {/* Profile hero */}
        <div className="hero-card">
          <div className="profile-av" style={{ background: "linear-gradient(135deg,#ffb43a,#ff7a45)" }}>A</div>
          <div className="hc-body">
            <h1>Ayesha Rahman <span className="badge-verify" title="Verified">✔️</span></h1>
            <div className="meta">
              <span>📍 Dhaka, Bangladesh</span>
              <span>🔗 @ayesha.creates</span>
              <span>⭐ 4.9 rating</span>
            </div>
            <div className="tags">
              <span className="tag-pill">Lifestyle</span>
              <span className="tag-pill">Fashion</span>
              <span className="tag-pill">TikTok</span>
              <span className="tag-pill">Instagram</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-ghost">Message</button>
            <button className="btn btn-primary">Invite</button>
          </div>
        </div>

        {/* Stat boxes */}
        <div className="stat-row" style={{ marginBottom: 18 }}>
          <div className="stat-box"><div className="n">248k</div><div className="l">Followers</div></div>
          <div className="stat-box"><div className="n">37</div><div className="l">Challenges done</div></div>
          <div className="stat-box"><div className="n">8.6%</div><div className="l">Engagement rate</div></div>
          <div className="stat-box"><div className="n">$9.2k</div><div className="l">Total earned</div></div>
        </div>

        <div className="detail-grid">
          {/* Left: recent work */}
          <div className="stack">
            <div className="panel">
              <div className="panel-head"><h3>Recent work</h3><a href="#">View all</a></div>
              <div className="sub-grid">
                {[
                  ["linear-gradient(135deg,#ff7a45,#a855f7)", "🎬", "Summer Reels Sprint", "42k", "live", "Approved"],
                  ["linear-gradient(135deg,#ffb43a,#f4526a)", "📸", "Product Story", "31k", "live", "Approved"],
                  ["linear-gradient(135deg,#a855f7,#38e8c8)", "🎨", "Brand Remix", "19k", "review", "In review"],
                ].map(([grad, emoji, title, views, st, stLabel], i) => (
                  <div className="sub-card" key={i}>
                    <div className="sub-media" style={{ background: grad }}>{emoji}</div>
                    <div className="sub-info">
                      <b style={{ fontSize: 13 }}>{title}</b>
                      <div className="row" style={{ marginTop: 6 }}>
                        <span>👁️ {views}</span><span className={`status ${st}`}>{stLabel}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head"><h3>About</h3></div>
              <p className="brief">
                Dhaka-based lifestyle and fashion content creator. Loves weaving brands naturally into everyday-life
                stories. Over 3 years, has taken part in 37 brand challenges with an average engagement rate of 8.6%.
              </p>
            </div>
          </div>

          {/* Right: details */}
          <div className="stack">
            <div className="panel">
              <div className="panel-head"><h3>Platforms</h3></div>
              <ul className="info-list">
                <li><span>TikTok</span><b>180k</b></li>
                <li><span>Instagram</span><b>52k</b></li>
                <li><span>YouTube</span><b>16k</b></li>
              </ul>
            </div>
            <div className="panel">
              <div className="panel-head"><h3>Reliability</h3></div>
              <ul className="info-list">
                <li><span>Clean score</span><b style={{ color: "var(--ok)" }}>94%</b></li>
                <li><span>On-time delivery</span><b>98%</b></li>
                <li><span>Approval rate</span><b>89%</b></li>
                <li><span>Member since</span><b>2023</b></li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
