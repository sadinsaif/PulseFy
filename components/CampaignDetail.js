"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Spotlighted from "@/components/Spotlighted";
import CampaignSubmissions from "@/components/CampaignSubmissions";
import ReportModal from "@/components/ReportModal";
import TrustBadge from "@/components/TrustBadge";
import TrustPanel from "@/components/TrustPanel";
import TrustReviewForm from "@/components/TrustReviewForm";
import PrivateCampaignParticipants from "@/components/PrivateCampaignParticipants";
import { isLive, statusLabel, countdown, budgetLeft } from "@/lib/campaign";
import {
  PLATFORM_LABEL,
  CONTENT_TYPE_LABEL_LONG,
  labelsFor,
  parseMulti,
  ANY_PLATFORM,
} from "@/lib/taxonomy";

const STATUS_CLASS = { pending: "review", approved: "live", rejected: "ended" };
const STATUS_LABEL = {
  pending: "Pending Review",
  approved: "Approved",
  rejected: "Rejected",
};
const POST_PLATFORMS = ["tiktok", "instagram", "youtube", "x"];

/**
 * Campaign detail + submit form. Loads the campaign and the creator's own
 * existing submission (if any); lets them submit or update their clip link.
 */
export default function CampaignDetail({ id, user, isAdmin = false }) {
  const [camp, setCamp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mine, setMine] = useState(null); // creator's existing submission
  const [platform, setPlatform] = useState("tiktok");
  const [postUrl, setPostUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  // Slow ticking clock so the live countdown stays fresh.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

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

  // A campaign can target multiple platforms. Constrain the creator's submission
  // platform picker to what the campaign accepts ("any" → all). If they have no
  // existing submission and the current pick isn't allowed, snap to the first
  // allowed one so the select never shows a platform the campaign didn't ask for.
  useEffect(() => {
    if (!camp || mine) return;
    const parsed = parseMulti(camp.platform);
    const allowed =
      parsed.includes(ANY_PLATFORM) || parsed.length === 0
        ? POST_PLATFORMS
        : POST_PLATFORMS.filter((p) => parsed.includes(p));
    const list = allowed.length ? allowed : POST_PLATFORMS;
    setPlatform((cur) => (list.includes(cur) ? cur : list[0]));
  }, [camp, mine]);

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

  // A campaign only accepts submissions while it's live (active AND not past
  // its end date). An expired active campaign is treated as ended.
  const live = isLive(camp);
  const open = live;
  const left = countdown(camp.endsAt, now);

  // Submission platform options: the campaign's platforms ("any" → all four).
  const parsedPlatforms = parseMulti(camp.platform);
  const postPlatforms =
    parsedPlatforms.includes(ANY_PLATFORM) || parsedPlatforms.length === 0
      ? POST_PLATFORMS
      : POST_PLATFORMS.filter((p) => parsedPlatforms.includes(p));
  const allowedPost = postPlatforms.length ? postPlatforms : POST_PLATFORMS;

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
            <span>🏢 {camp.brandName || "A brand"} <TrustBadge verified={camp.brandVerified} /></span>
            {camp.budget > 0 && (
              <span>💰 Budget ${Number(budgetLeft(camp)).toLocaleString()}</span>
            )}
            <span>💸 ${camp.reward} per approved post</span>
            {live && left && <span>⏳ {left}</span>}
          </div>
          <div className="tags">
            {labelsFor(camp.platform, PLATFORM_LABEL).map((label, i) => (
              <span key={i} className="tag-pill">{label}</span>
            ))}
            <span className={`status ${live ? "live" : "ended"}`}>{statusLabel(camp)}</span>
          </div>

          {/* Reward pills — Approval / Performance / Spotlight (GIMI-style) */}
          <div className="camp-pills" style={{ marginTop: 10 }}>
            <span className="camp-pill">✅ Approval: ${camp.reward}</span>
            <span className="camp-pill">📈 Performance: ×{Number(camp.performanceMult) || 1}</span>
            {Number(camp.spotlightReward) > 0 && (
              <span className="camp-pill">⭐ Spotlight: ${camp.spotlightReward}</span>
            )}
          </div>

          {camp.brief && <p className="brief" style={{ marginTop: 10 }}>{camp.brief}</p>}
          <div style={{ marginTop: 12 }}><ReportModal reportedUserId={camp.brandId} reportedUserName={camp.brandName} reportedUserType="brand" label="Report brand" /></div>
        </div>
      </div>

      {camp.visibility === "private" && (camp.brandId === user?.id || isAdmin) && <PrivateCampaignParticipants campaignId={id} />}
      {!open && user?.role === "creator" && mine && <TrustReviewForm campaignId={id} revieweeId={camp.brandId} label="Review this brand" />}
      <TrustPanel userId={camp.brandId} />

      {/* Campaign details panel */}
      {(camp.contentType || camp.requirements || camp.assetsUrl) && (
        <div className="panel" style={{ marginTop: 18 }}>
          <div className="panel-head"><h3>Campaign details</h3></div>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 14 }}>
            {camp.contentType && (
              <div>
                <b style={{ fontSize: 13, color: "var(--text-dim)" }}>Content type</b>
                <p style={{ marginTop: 4, fontSize: 13, color: "var(--text-mute)" }}>
                  Creators can submit content matching any of these:
                </p>
                <div className="tags" style={{ marginTop: 6 }}>
                  {labelsFor(camp.contentType, CONTENT_TYPE_LABEL_LONG).map((label, i) => (
                    <span key={i} className="tag-pill">{label}</span>
                  ))}
                </div>
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
            <span className={`status ${STATUS_CLASS[mine.status] || "review"}`}>
              {STATUS_LABEL[mine.status] || mine.status}
            </span>
          )}
        </div>

        {mine && mine.status === "approved" && mine.reward > 0 && (
          <div className="alert info">You earned ${mine.reward} from this campaign 🎉</div>
        )}
        {mine && mine.status === "pending" && (
          <p className="brief" style={{ marginTop: 8 }}>
            Your submission is <b>in review</b>. You&apos;ll be notified once the brand
            approves or rejects it. You can update your link below any time before then.
          </p>
        )}
        {mine && mine.status === "rejected" && (
          <p className="brief" style={{ marginTop: 8 }}>
            This submission was <b>rejected</b>. You can revise your post and submit
            again below.
          </p>
        )}

        {!open ? (
          <p className="brief" style={{ marginTop: 8 }}>
            {camp.status === "paused" ? (
              <>This campaign is <b>paused</b> and isn&apos;t accepting submissions right now.</>
            ) : (
              <>This campaign has <b>ended</b> and isn&apos;t accepting submissions right now.</>
            )}
          </p>
        ) : (
          <form onSubmit={submit} className="profile-form" style={{ marginTop: 12 }}>
            {err && <div className="alert err">{err}</div>}
            {msg && <div className="alert info">{msg}</div>}
            <div className="two-col">
              <div className="field">
                <label>Platform</label>
                <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
                  {allowedPost.map((p) => (
                    <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>
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

      {/* Spotlighted posts for THIS campaign (renders only when non-empty) */}
      <div style={{ marginTop: 18 }}>
        <Spotlighted campaignId={id} />
      </div>

      {/* Every submission to this campaign, with per-creator earnings. Only the
          owning brand + admins can load it (the API 403s everyone else), so
          regular creators see nothing here — just the Spotlighted section above. */}
      <CampaignSubmissions campaignId={id} completed={!open} />

      <p style={{ marginTop: 16 }}>
        <Link href="/dashboard/campaigns" style={{ color: "var(--accent)" }}>← Back to campaigns</Link>
      </p>
    </>
  );
}
