"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

  const PLABEL = {
  any: "Any platform",
  tiktok: "🎵 TikTok",
  instagram: "📸 Instagram",
  youtube: "▶️ YouTube",
  x: "𝕏 X",
};
const CONTENT_TYPE_LABEL = {
  ugc: "UGC (Raw, authentic creator content)",
  edit: "Edit / Remix / Clip",
  ai: "AI generated",
  open: "Open Format (Memes, slides, screenshots, etc.)",
};
const STATUS_CLASS = { pending: "review", approved: "live", rejected: "ended" };
const POST_PLATFORMS = ["tiktok", "instagram", "youtube", "x"];

/**
 * Campaign detail + submit form. Loads the campaign and the creator's own
 * existing submission (if any); lets them submit or update their clip link.
 */
export default function CampaignDetail({ id }) {
  const [camp, setCamp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mine, setMine] = useState(null); // creator's existing submission
  const [platform, setPlatform] = useState("tiktok");
  const [postUrl, setPostUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function load() {
    try {
      const [cRes, sRes] = await Promise.all([
        fetch(`/api/campaigns/${id}`),
        fetch(`/api/submit?campaignId=${id}`),
      ]);
      const cData = await cRes.json().catch(() => ({}));
      if (cRes.ok) setCamp(cData.campaign);
      const sData = await sRes.json().catch(() => ({}));
      if (sRes.ok && sData.submission) {
        setMine(sData.submission);
        setPlatform(sData.submission.platform || "tiktok");
        setPostUrl(sData.submission.postUrl || "");
        setCaption(sData.submission.caption || "");
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: camp.title, campaignId: id, platform, postUrl, caption }),
      });
      const data = await res.json().catch(() => ({}));
      setBusy(false);
      if (!res.ok) {
        setErr(data.error || "Could not submit. Try again.");
        return;
      }
      setMsg(data.message || "Submitted!");
      load();
    } catch {
      setBusy(false);
      setErr("Network error. Please try again.");
    }
  }

  if (loading) return <p className="brief">Loading campaign…</p>;
  if (!camp) {
    return (
      <div className="panel">
        <p className="brief">Campaign not found.</p>
        <Link href="/dashboard/campaigns" style={{ color: "var(--accent)" }}>← Back to campaigns</Link>
      </div>
    );
  }

  const open = camp.status === "active";

  return (
    <>
      {/* Banner image (if present) */}
      {camp.bannerUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={camp.bannerUrl} alt="Campaign banner" className="camp-detail-banner" />
      )}

      <div className="hero-card">
        {camp.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="profile-av img" src={camp.thumbnailUrl} alt={camp.title} />
        ) : (
          <div
            className="profile-av"
            style={{ background: "linear-gradient(135deg,#ffb43a,#ff7a45)" }}
          >
            {(camp.title || "C")[0].toUpperCase()}
          </div>
        )}
        <div className="hc-body">
          <h1>{camp.title}</h1>
          <div className="meta">
            <span>🏢 {camp.brandName || "A brand"}</span>
            <span>💸 ${camp.reward} per approved post</span>
          </div>
          <div className="tags">
            <span className="tag-pill">{PLABEL[camp.platform] || camp.platform}</span>
            <span className={`status ${STATUS_CLASS[camp.status] || "review"}`}>{camp.status}</span>
          </div>
          {camp.brief && <p className="brief" style={{ marginTop: 10 }}>{camp.brief}</p>}
        </div>
      </div>

      {/* Campaign details panel */}
      {(camp.contentType || camp.requirements || camp.assetsUrl) && (
        <div className="panel" style={{ marginTop: 18 }}>
          <div className="panel-head"><h3>Campaign details</h3></div>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 14 }}>
            {camp.contentType && (
              <div>
                <b style={{ fontSize: 13, color: "var(--text-dim)" }}>Content type</b>
                <p style={{ marginTop: 4 }}>{CONTENT_TYPE_LABEL[camp.contentType] || camp.contentType}</p>
              </div>
            )}
            {camp.requirements && (
              <div>
                <b style={{ fontSize: 13, color: "var(--text-dim)" }}>Must-include requirements</b>
                <p style={{ marginTop: 4 }}>{camp.requirements}</p>
              </div>
            )}
            {camp.assetsUrl && (
              <div>
                <b style={{ fontSize: 13, color: "var(--text-dim)" }}>Campaign assets</b>
                <p style={{ marginTop: 4 }}>
                  <a href={camp.assetsUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                    Open assets folder ↗
                  </a>
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="panel-head">
          <h3>{mine ? "Your submission" : "Submit your clip"}</h3>
          {mine && (
            <span className={`status ${STATUS_CLASS[mine.status] || "review"}`}>{mine.status}</span>
          )}
        </div>

        {mine && mine.status === "approved" && mine.reward > 0 && (
          <div className="alert info">You earned ${mine.reward} from this campaign 🎉</div>
        )}

        {!open ? (
          <p className="brief" style={{ marginTop: 8 }}>
            This campaign is <b>{camp.status}</b> and isn&apos;t accepting submissions right now.
          </p>
        ) : (
          <form onSubmit={submit} className="profile-form" style={{ marginTop: 12 }}>
            {err && <div className="alert err">{err}</div>}
            {msg && <div className="alert info">{msg}</div>}
            <div className="two-col">
              <div className="field">
                <label>Platform</label>
                <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
                  {POST_PLATFORMS.map((p) => (
                    <option key={p} value={p}>{PLABEL[p]}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Post link</label>
                <input
                  type="url"
                  value={postUrl}
                  placeholder="https://…"
                  onChange={(e) => setPostUrl(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="field">
              <label>Caption (optional)</label>
              <textarea
                rows={2}
                value={caption}
                placeholder="A note for the brand…"
                onChange={(e) => setCaption(e.target.value)}
              />
            </div>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? "Submitting…" : mine ? "Update submission" : "Submit clip"}
            </button>
          </form>
        )}
      </div>

      <p style={{ marginTop: 16 }}>
        <Link href="/dashboard/campaigns" style={{ color: "var(--accent)" }}>← Back to campaigns</Link>
      </p>
    </>
  );
}
