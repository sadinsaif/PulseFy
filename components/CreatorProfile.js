"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ReportModal from "@/components/ReportModal";
import TrustPanel from "@/components/TrustPanel";

const PLATFORM_LABEL = {
  tiktok: "🎵 TikTok",
  instagram: "📸 Instagram",
  youtube: "▶️ YouTube",
  x: "𝕏 X",
  any: "🌐 Any",
};

/**
 * Public, read-only view of any creator's profile: header (avatar, name, bio,
 * interests, socials), stat cards, and their approved clips (portfolio of
 * submitted videos). Data comes from /api/creators/[id].
 */
export default function CreatorProfile({ id, meId = "" }) {
  const [data, setData] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followers, setFollowers] = useState(0);
  const [followLoading, setFollowLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/creators/${id}`);
        if (!res.ok) {
          setNotFound(true);
          return;
        }
        const json = await res.json();
        setData(json);
        setFollowers(json.stats?.followers || 0);
      } catch {
        setNotFound(true);
      }
    })();
  }, [id]);

  // Load whether the signed-in user follows this profile (skip own profile).
  useEffect(() => {
    if (!meId || meId === id) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/follow?user=${encodeURIComponent(id)}`);
        if (!res.ok) return;
        const d = await res.json();
        if (alive) setFollowing(Boolean(d.following));
      } catch {
        /* silent */
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, meId]);

  async function toggleFollow() {
    if (followLoading) return;
    setFollowLoading(true);
    try {
      const res = await fetch("/api/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id }),
      });
      if (res.ok) {
        const result = await res.json();
        setFollowing(result.following);
        setFollowers((prev) => Math.max(0, prev + (result.following ? 1 : -1)));
      }
    } catch {
      /* silent */
    }
    setFollowLoading(false);
  }

  if (notFound) {
    return (
      <div className="panel">
        <p className="brief">This creator could not be found.</p>
        <Link href="/dashboard/creators" className="btn btn-ghost" style={{ marginTop: 10 }}>
          ← Back to leaderboard
        </Link>
      </div>
    );
  }

  if (!data) return <p className="brief">Loading profile…</p>;

  const { profile, stats, clips } = data;
  const initial = (profile.name || profile.username || "S")[0].toUpperCase();
  const interestList = (profile.interests || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <>
      <p className="breadcrumb">
        <Link href="/dashboard/creators">Leaderboard</Link> / {profile.name || "Creator"}
      </p>

      {/* Header */}
      <div className="hero-card">
        {profile.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="profile-av img" src={profile.image} alt={profile.name} />
        ) : (
          <div
            className="profile-av"
            style={{ background: "linear-gradient(135deg,#ffb43a,#ff7a45)" }}
          >
            {initial}
          </div>
        )}
        <div className="hc-body">
          <h1>{profile.name || "Creator"}</h1>
          <div className="meta">
            {profile.username && <span>🔗 @{profile.username}</span>}
          </div>
          {profile.bio && <p className="brief" style={{ marginTop: 8 }}>{profile.bio}</p>}
          {interestList.length > 0 && (
            <div className="tags">
              {interestList.map((t, i) => (
                <span className="tag-pill" key={i}>{t}</span>
              ))}
            </div>
          )}
          {(profile.twitter || profile.instagram) && (
            <div className="tags" style={{ marginTop: 8 }}>
              {profile.twitter && <span className="tag-pill">𝕏 {profile.twitter}</span>}
              {profile.instagram && <span className="tag-pill">📸 {profile.instagram}</span>}
            </div>
          )}
          {meId && meId !== profile.id && (
            <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
              <button
                className={following ? "btn btn-ghost" : "btn btn-primary"}
                onClick={toggleFollow}
                disabled={followLoading}
              >
                {following ? "Following ✓" : "＋ Follow"}
              </button>
              <ReportModal reportedUserId={profile.id} reportedUserName={profile.name} reportedUserType="creator" label="Report creator" />
              <Link href={`/dashboard/inbox?to=${profile.id}`} className="btn btn-ghost">
                ✉️ Message
              </Link>
            </div>
          )}
        </div>
      </div>

      <TrustPanel userId={id} />

      {/* Stat boxes */}
      <div className="stat-row" style={{ marginBottom: 18 }}>
        <div className="stat-box">
          <div className="n">{stats.submitted}</div>
          <div className="l">Submissions</div>
        </div>
        <div className="stat-box">
          <div className="n" style={{ color: "var(--ok)" }}>{stats.approved}</div>
          <div className="l">Approved</div>
        </div>
        <div className="stat-box">
          <div className="n">{stats.rejected}</div>
          <div className="l">Rejected</div>
        </div>
        <div className="stat-box">
          <div className="n">{stats.approvalRate}%</div>
          <div className="l">Approval rate</div>
        </div>
        <div className="stat-box">
          <div className="n" style={{ color: "var(--accent-3)" }}>${stats.earnings}</div>
          <div className="l">Earnings</div>
        </div>
        <div className="stat-box">
          <div className="n">{followers}</div>
          <div className="l">Followers</div>
        </div>
        <div className="stat-box">
          <div className="n">{stats.following || 0}</div>
          <div className="l">Following</div>
        </div>
      </div>

      {/* Approved clips = public portfolio */}
      <div className="panel">
        <div className="panel-head">
          <h3>Approved clips</h3>
        </div>
        {clips.length === 0 ? (
          <p className="brief" style={{ marginTop: 8 }}>
            No approved clips yet.
          </p>
        ) : (
          <div className="clip-grid">
            {clips.map((c) => (
              <a
                key={c.id}
                href={c.postUrl}
                target="_blank"
                rel="noreferrer"
                className={`clip-card ${c.spotlighted ? "spotlight" : ""}`}
              >
                {c.spotlighted && <span className="clip-spot">✦ Spotlight</span>}
                <div className="clip-plat">{PLATFORM_LABEL[c.platform] || c.platform}</div>
                <div className="clip-title">{c.challengeId}</div>
                <div className="clip-foot">
                  {c.reward > 0 && <span className="clip-reward">${c.reward}</span>}
                  <span className="clip-open">Watch ↗</span>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
