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
  // "Saved" filters to the creator's bookmarked campaigns. Its membership is
  // resolved at render time against live savedIds state (see filterTest), so it
  // carries a flag instead of a baked-in test.
  { key: "saved", label: "Saved", saved: true },
];

// Resolve a filter's membership test. The static content/platform filters carry
// their own `test`; the "Saved" filter's depends on live state, so it's built
// here against the current savedIds set.
function filterTest(f, savedIds) {
  return f.saved ? (c) => savedIds.has(c.id) : f.test;
}

// Sort options. "Recommended" keeps the server order (live campaigns first, then
// newest) so the default view is unchanged. The rest re-order a copy client-side.
const SORTS = [
  { key: "recommended", label: "Recommended" },
  { key: "reward", label: "Highest reward" },
  { key: "budget", label: "Biggest budget" },
  { key: "ending", label: "Ending soonest" },
  { key: "newest", label: "Newest" },
];

// End date as a sortable number. Open-ended campaigns (no endsAt) sort last for
// "Ending soonest" — they never end, so they shouldn't jump ahead of dated ones.
function endsAtValue(c) {
  if (!c.endsAt) return Infinity;
  const t = new Date(c.endsAt).getTime();
  return Number.isNaN(t) ? Infinity : t;
}

function createdAtValue(c) {
  const t = new Date(c.createdAt).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function sortCampaigns(list, sort) {
  if (sort === "recommended") return list; // preserve API order
  const copy = [...list];
  switch (sort) {
    case "reward":
      return copy.sort((a, b) => (b.reward || 0) - (a.reward || 0));
    case "budget":
      return copy.sort((a, b) => (b.budget || 0) - (a.budget || 0));
    case "ending":
      return copy.sort((a, b) => endsAtValue(a) - endsAtValue(b));
    case "newest":
      return copy.sort((a, b) => createdAtValue(b) - createdAtValue(a));
    default:
      return copy;
  }
}

/**
 * Creator view of /dashboard/campaigns — a grid of brand campaigns to browse
 * and join, rendered with the shared GIMI-style CampaignCard (thumbnail badge,
 * Budget + live countdown overlay, Approval / Performance / Spotlight pills).
 * Search and sort are client-side over the already-fetched list; the filter
 * chips narrow by content type / platform. Live campaigns sort above finished
 * ones under "Recommended" (the API orders them that way).
 */
export default function BrowseCampaigns() {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("recommended");
  // A single slow clock shared by every card's countdown.
  const [now, setNow] = useState(() => Date.now());
  // The creator's bookmarked campaign ids, for the Save toggle + "Saved" filter.
  const [savedIds, setSavedIds] = useState(() => new Set());

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

  // Load the creator's saved campaign ids so each card renders in the right
  // state and the "Saved" filter works. Fail-soft: Save just starts empty.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/saved-campaigns");
        if (!res.ok) return;
        const data = await res.json();
        setSavedIds(new Set(data.ids || []));
      } catch {
        /* ignore */
      }
    })();
  }, []);

  // Optimistic Save/unsave: flip the local set immediately, then persist. Revert
  // if the request fails so the card never lies about its saved state.
  async function toggleSave(id) {
    const isSaved = savedIds.has(id);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (isSaved) next.delete(id);
      else next.add(id);
      return next;
    });
    try {
      const res = await fetch("/api/saved-campaigns", {
        method: isSaved ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: id }),
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (isSaved) next.add(id);
        else next.delete(id);
        return next;
      });
    }
  }

  // Rows matching the search box (title, brief, or brand name). Runs before the
  // filter chips so the per-tab counts reflect the current search.
  const searched = useMemo(() => {
    const list = rows || [];
    const term = q.trim().toLowerCase();
    if (!term) return list;
    return list.filter((c) =>
      [c.title, c.brief, c.brandName]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(term))
    );
  }, [rows, q]);

  // Live counts per tab (computed against the searched set).
  const counts = useMemo(() => {
    const c = {};
    for (const f of FILTERS) c[f.key] = searched.filter(filterTest(f, savedIds)).length;
    return c;
  }, [searched, savedIds]);

  if (rows === null) return <p className="brief">Loading campaigns…</p>;

  const active = FILTERS.find((f) => f.key === filter) || FILTERS[0];
  const shown = sortCampaigns(searched.filter(filterTest(active, savedIds)), sort);

  return (
    <>
      <div className="search-bar" style={{ marginBottom: 14 }}>
        <span className="search-ic">🔍</span>
        <input
          placeholder="Search campaigns by title, brief, or brand…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort campaigns">
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

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
      ) : searched.length === 0 ? (
        <p className="brief" style={{ marginTop: 18 }}>
          No campaigns match your search.
        </p>
      ) : shown.length === 0 ? (
        <p className="brief" style={{ marginTop: 18 }}>
          {filter === "saved"
            ? "None of these campaigns are saved yet. Tap Save on a campaign to bookmark it — your full list lives under Saved."
            : "No campaigns match this filter yet."}
        </p>
      ) : (
        <div className="camp-grid" style={{ marginTop: 16 }}>
          {shown.map((c) => (
            <CampaignCard
              key={c.id}
              c={c}
              now={now}
              saved={savedIds.has(c.id)}
              onToggleSave={toggleSave}
            />
          ))}
        </div>
      )}
    </>
  );
}
