"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isLive, statusLabel, countdown } from "@/lib/campaign";

const PLABEL = {
  any: "Any platform",
  tiktok: "🎵 TikTok",
  instagram: "📸 Instagram",
  youtube: "▶️ YouTube",
  x: "𝕏 X",
};

const CONTENT_TYPE_LABEL = {
  ugc: "UGC",
  edit: "Edit",
  ai: "AI Generated",
  open: "Open Format",
};

/**
 * Creator view of /dashboard/campaigns — a grid of brand campaigns to browse
 * and join. Each card shows thumbnail, content-type badge, a Live/End status
 * badge with a live countdown, the campaign Budget, and the Approval /
 * Performance / Spotlight reward pills (GIMI-style). Live campaigns sort above
 * finished ones (the API already orders them; we keep it stable here too).
 */
export default function BrowseCampaigns() {
  const [rows, setRows] = useState(null);
  // A slow ticking clock so the countdown stays fresh without a heavy re-render.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/campaigns");
        const data = await res.json();
        setRows(res.ok ? data.campaigns || [] : []);
      } catch {
        setRows([]);
      }
    })();
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  if (rows === null) return <p className="brief">Loading campaigns…</p>;

  if (rows.length === 0) {
    return (
      <div className="panel">
        <p className="brief">
          No open campaigns right now. Check back soon — brands post new ones
          regularly.
        </p>
      </div>
    );
  }

  return (
    <div className="camp-grid">
      {rows.map((c) => {
        const live = isLive(c);
        const left = countdown(c.endsAt, now);
        return (
          <Link
            key={c.id}
            href={`/dashboard/campaigns/${c.id}`}
            className={`camp-card ${live ? "" : "is-ended"}`}
          >
            {/* Thumbnail (or gradient fallback) with content-type badge */}
            <div className="camp-thumb">
              {c.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.thumbnailUrl} alt={c.title} />
              ) : (
                <div
                  className="camp-thumb-fallback"
                  style={{ background: "linear-gradient(135deg,#ffb43a,#ff7a45)" }}
                >
                  {(c.title || "C")[0].toUpperCase()}
                </div>
              )}
              {/* Live / End status badge (top-left corner) */}
              <span className={`camp-status-badge ${live ? "live" : "end"}`}>
                {statusLabel(c)}
              </span>
              {/* Countdown (top-right corner) — only while live and time-boxed */}
              {live && left && (
                <span className="camp-countdown">⏳ {left}</span>
              )}
              {c.contentType && (
                <span className="camp-badge">{CONTENT_TYPE_LABEL[c.contentType] || c.contentType}</span>
              )}
            </div>

            <div className="camp-body">
              <div className="camp-top">
                {c.budget > 0 ? (
                  <span className="camp-budget">
                    <small>Budget</small>${Number(c.budget).toLocaleString()}
                  </span>
                ) : (
                  <span className="camp-reward">${c.reward}<small>/post</small></span>
                )}
                <span className="tag-pill">{PLABEL[c.platform] || c.platform}</span>
              </div>
              <h3>{c.title}</h3>
              <p className="camp-brand">by {c.brandName || "A brand"}</p>

              {/* Reward pills — Approval / Performance / Spotlight */}
              <div className="camp-pills">
                <span className="camp-pill">✅ Approval: ${c.reward}</span>
                {Number(c.performanceMult) > 1 && (
                  <span className="camp-pill">📈 Performance: ×{c.performanceMult}</span>
                )}
                {Number(c.spotlightReward) > 0 && (
                  <span className="camp-pill">⭐ Spotlight: ${c.spotlightReward}</span>
                )}
              </div>

              {c.brief && <p className="camp-brief">{c.brief}</p>}
              <div className="camp-foot">
                <span>{c.submissionCount ?? 0} submissions</span>
                <span className="camp-join">
                  {live ? "Join & submit →" : "View campaign →"}
                </span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
