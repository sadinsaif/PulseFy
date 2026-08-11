"use client";

import { useEffect, useMemo, useState } from "react";
import CampaignCard from "@/components/CampaignCard";
import { platformMatches, contentTypeMatches } from "@/lib/taxonomy";

// Filter tabs. contentType-based (UGC / AI / Clipping) and platform-based tabs
// share one row; a campaign matches by its own contentType/platform field.
// Both fields are multi-value (comma-separated), so matching is membership-based
// via the taxonomy helpers — a "tiktok,instagram" campaign shows under BOTH the
// TikTok and Instagram tabs, and an "any" campaign shows under every platform
// tab. "Clipping" maps to the "edit" contentType (Edit / Remix / Clip).
const FILTERS = [
  { key: "all", label: "All", test: () => true },
  { key: "ugc", label: "UGC", test: (c) => contentTypeMatches(c.contentType, "ugc") },
  { key: "ai", label: "AI Generated", test: (c) => contentTypeMatches(c.contentType, "ai") },
  { key: "edit", label: "Clipping", test: (c) => contentTypeMatches(c.contentType, "edit") },
  { key: "tiktok", label: "TikTok", test: (c) => platformMatches(c.platform, "tiktok") },
  { key: "instagram", label: "Instagram", test: (c) => platformMatches(c.platform, "instagram") },
  { key: "youtube", label: "YouTube", test: (c) => platformMatches(c.platform, "youtube") },
  { key: "x", label: "X", test: (c) => platformMatches(c.platform, "x") },
];

/**
 * Creator view of /dashboard/campaigns — a grid of brand campaigns to browse
 * and join, rendered with the shared GIMI-style CampaignCard (thumbnail badge,
 * Budget + live countdown overlay, Approval / Performance / Spotlight pills).
 * Live campaigns sort above finished ones (the API already orders them).
 */
export default function BrowseCampaigns() {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState("all");
  // A single slow clock shared by every card's countdown.
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

  // Live counts per tab (computed against the full result set).
  const counts = useMemo(() => {
    const list = rows || [];
    const c = {};
    for (const f of FILTERS) c[f.key] = list.filter(f.test).length;
    return c;
  }, [rows]);

  if (rows === null) return <p className="brief">Loading campaigns…</p>;

  const active = FILTERS.find((f) => f.key === filter) || FILTERS[0];
  const shown = rows.filter(active.test);

  return (
    <>
      <div className="review-filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`platform-chip ${filter === f.key ? "active" : ""}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label} <span className="chip-count">{counts[f.key] || 0}</span>
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="panel" style={{ marginTop: 16 }}>
          <p className="brief">
            No open campaigns right now. Check back soon — brands post new ones
            regularly.
          </p>
        </div>
      ) : shown.length === 0 ? (
        <p className="brief" style={{ marginTop: 18 }}>
          No campaigns match this filter yet.
        </p>
      ) : (
        <div className="camp-grid" style={{ marginTop: 16 }}>
          {shown.map((c) => (
            <CampaignCard key={c.id} c={c} now={now} />
          ))}
        </div>
      )}
    </>
  );
}
