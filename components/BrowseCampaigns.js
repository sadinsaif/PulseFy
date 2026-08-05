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

/**
 * Creator view of /dashboard/campaigns — a grid of active brand campaigns to
 * browse and join. Each card links to the campaign detail + submit page.
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
        </Link>
      ))}
    </div>
  );
}
