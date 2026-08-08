"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const PLATFORM_LABEL = {
  tiktok: "🎵 TikTok",
  instagram: "📸 Instagram",
  youtube: "▶️ YouTube",
  x: "𝕏 X",
  any: "🌐 Any",
};
const STATUS_CLASS = { pending: "review", approved: "live", rejected: "ended" };

// Compact number: 5400 → "5.4K", 2100000 → "2.1M".
function fmtCompact(n) {
  const v = Math.round(Number(n) || 0);
  if (v >= 999_950_000) return (v / 1_000_000_000).toFixed(1) + "B";
  if (v >= 999_950) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 999.95) return (v / 1_000).toFixed(1) + "K";
  return String(v);
}

/**
 * All submissions for one campaign — GIMI-style grid shown BELOW the public
 * Spotlighted section on the campaign detail page. Restricted server-side to
 * the campaign owner (brand) and admins: /api/campaigns/[id]/submissions
 * returns 403 to everyone else, so for regular creators this component fetches
 * nothing and renders null — they only ever see the Spotlighted section.
 * Each card shows the creator's earnings = approval reward + spotlight bonus.
 */
export default function CampaignSubmissions({ campaignId }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/submissions`);
        if (!res.ok) {
          setRows([]);
          return;
        }
        const data = await res.json();
        setRows(data.submissions || []);
      } catch {
        setRows([]);
      }
    })();
  }, [campaignId]);

  // Nothing to show (no posts yet, or the viewer isn't a brand/admin) → hide.
  if (!rows || rows.length === 0) return null;

  return (
    <section className="panel spotlight-panel" style={{ marginTop: 18 }}>
      <div className="panel-head">
        <h3>All submissions</h3>
        <span className="brief" style={{ fontSize: 13 }}>
          Every post creators sent to this campaign — only you (the brand) can see this
        </span>
      </div>

      <div className="spot-grid" style={{ marginTop: 14 }}>
        {rows.map((s) => {
          const initial = (s.creatorName || s.creatorUsername || "S")[0].toUpperCase();
          // Earnings must reconcile with the campaign's budgetSpent, which only
          // counts a post's reward once it's APPROVED (spotlight bonus is paid
          // whenever spotlighted). Otherwise a post approved-then-resubmitted
          // would still show its old reward while pending.
          const earned =
            (s.status === "approved" ? Number(s.reward) || 0 : 0) +
            (Number(s.spotlightBonus) || 0);
          return (
            <div key={s.id} className={`spot-card${s.spotlighted ? " row-spotlight" : ""}`}>
              <div className="spot-card-top">
                <span className={`status ${STATUS_CLASS[s.status] || "review"}`}>{s.status}</span>
                <span className="spot-earn">${earned} Earnings</span>
              </div>

              <a href={s.postUrl} target="_blank" rel="noreferrer" className="spot-title">
                {s.challengeId}
              </a>

              <div className="spot-meta">
                <span className="spot-plat">{PLATFORM_LABEL[s.platform] || s.platform}</span>
                {s.views > 0 && (
                  <span className="spot-views" title={`${(Number(s.views) || 0).toLocaleString()} views`}>
                    👁 {fmtCompact(s.views)}
                  </span>
                )}
              </div>

              <div className="spot-foot">
                {s.creatorId ? (
                  <Link href={`/creator/${s.creatorId}`} className="spot-creator">
                    {s.creatorImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="spot-av" src={s.creatorImage} alt={s.creatorName || "Creator"} />
                    ) : (
                      <span
                        className="spot-av"
                        style={{ background: "linear-gradient(135deg,#ffb43a,#ff7a45)" }}
                      >
                        {initial}
                      </span>
                    )}
                    <span className="spot-name">{s.creatorName || "Creator"}</span>
                  </Link>
                ) : (
                  <span className="spot-creator">
                    <span
                      className="spot-av"
                      style={{ background: "linear-gradient(135deg,#ffb43a,#ff7a45)" }}
                    >
                      {initial}
                    </span>
                    <span className="spot-name">{s.creatorName || "Creator"}</span>
                  </span>
                )}
                <a href={s.postUrl} target="_blank" rel="noreferrer" className="spot-open">
                  Watch ↗
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
