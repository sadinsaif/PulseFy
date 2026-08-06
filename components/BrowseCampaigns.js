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
  ugc: "UGC",
  edit: "Edit",
  ai: "AI Generated",
  open: "Open Format",
};

/**
 * Creator view of /dashboard/campaigns — a grid of active brand campaigns to
 * browse and join. Each card shows thumbnail, content-type badge, reward, brief.
 */
export default function BrowseCampaigns() {
  const [rows, setRows] = useState(null);

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
      {rows.map((c) => (
        <Link key={c.id} href={`/dashboard/campaigns/${c.id}`} className="camp-card">
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
            {c.contentType && (
              <span className="camp-badge">{CONTENT_TYPE_LABEL[c.contentType] || c.contentType}</span>
            )}
          </div>

          <div className="camp-body">
            <div className="camp-top">
              <span className="camp-reward">${c.reward}<small>/post</small></span>
              <span className="tag-pill">{PLABEL[c.platform] || c.platform}</span>
            </div>
            <h3>{c.title}</h3>
            <p className="camp-brand">by {c.brandName || "A brand"}</p>
            {c.brief && <p className="camp-brief">{c.brief}</p>}
            <div className="camp-foot">
              <span>{c.submissionCount ?? 0} submissions</span>
              <span className="camp-join">Join &amp; submit →</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
