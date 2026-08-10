"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import TrustBadge from "@/components/TrustBadge";

const PLATFORMS = [
  { key: "", label: "All platforms" },
  { key: "tiktok", label: "🎵 TikTok" },
  { key: "instagram", label: "📸 Instagram" },
  { key: "youtube", label: "▶️ YouTube" },
  { key: "x", label: "𝕏 X" },
];

const SORTS = [
  { key: "followers", label: "Most followers" },
  { key: "avgViews", label: "Highest avg views" },
  { key: "engagement", label: "Best engagement" },
  { key: "earnings", label: "Top earners" },
];

const PLAT_EMOJI = {
  tiktok: "🎵",
  instagram: "📸",
  youtube: "▶️",
  x: "𝕏",
};

function num(n) {
  return Number(n || 0).toLocaleString();
}

/**
 * Brand "Discover Creators" grid. Filters real creator data (search, platform,
 * min followers / avg views / engagement, sort) via /api/creators?rich=1, and
 * lets a brand open a profile or invite a creator to a campaign (a templated DM
 * through the existing messages endpoint — the creator sees it in their Inbox).
 */
export default function DiscoverCreators() {
  const [q, setQ] = useState("");
  const [platform, setPlatform] = useState("");
  const [minFollowers, setMinFollowers] = useState("");
  const [minViews, setMinViews] = useState("");
  const [minEngagement, setMinEngagement] = useState("");
  const [sort, setSort] = useState("followers");

  const [rows, setRows] = useState(null);
  const [invited, setInvited] = useState({}); // creatorId → "sending"|"sent"|"error"

  // Seed the search box from ?q= (Overview top-bar search lands here).
  useEffect(() => {
    try {
      const initial = new URLSearchParams(window.location.search).get("q");
      if (initial) setQ(initial);
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ rich: "1", sort });
    if (q.trim()) params.set("q", q.trim());
    if (platform) params.set("platform", platform);
    if (minFollowers) params.set("minFollowers", minFollowers);
    if (minViews) params.set("minViews", minViews);
    if (minEngagement) params.set("minEngagement", minEngagement);
    try {
      const res = await fetch(`/api/creators?${params.toString()}`);
      const data = await res.json();
      setRows(res.ok ? data.creators || [] : []);
    } catch {
      setRows([]);
    }
  }, [q, platform, minFollowers, minViews, minEngagement, sort]);

  // Debounce so typing/sliding doesn't spam the API.
  const timer = useRef(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(load, 300);
    return () => timer.current && clearTimeout(timer.current);
  }, [load]);

  async function invite(c) {
    setInvited((m) => ({ ...m, [c.id]: "sending" }));
    const body = `Hi ${
      c.name || c.username || "there"
    } — we love your content and would like to invite you to one of our PulseFy campaigns. Are you interested in collaborating?`;
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: c.id, body }),
      });
      setInvited((m) => ({ ...m, [c.id]: res.ok ? "sent" : "error" }));
    } catch {
      setInvited((m) => ({ ...m, [c.id]: "error" }));
    }
  }

  const list = rows || [];

  return (
    <>
      {/* Filter bar */}
      <section className="panel discover-filters">
        <div className="field">
          <label htmlFor="d-q">Search</label>
          <input
            id="d-q"
            className="search"
            placeholder="Name or @username…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="discover-filter-row">
          <div className="field">
            <label htmlFor="d-plat">Platform</label>
            <select id="d-plat" value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {PLATFORMS.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="d-foll">Min followers</label>
            <input
              id="d-foll"
              type="number"
              min="0"
              placeholder="0"
              value={minFollowers}
              onChange={(e) => setMinFollowers(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="d-views">Min avg views</label>
            <input
              id="d-views"
              type="number"
              min="0"
              placeholder="0"
              value={minViews}
              onChange={(e) => setMinViews(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="d-eng">Min engagement %</label>
            <input
              id="d-eng"
              type="number"
              min="0"
              step="0.1"
              placeholder="0"
              value={minEngagement}
              onChange={(e) => setMinEngagement(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="d-sort">Sort by</label>
            <select id="d-sort" value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Results */}
      {rows === null ? (
        <p className="brief" style={{ marginTop: 16 }}>Loading creators…</p>
      ) : list.length === 0 ? (
        <p className="brief" style={{ marginTop: 16 }}>
          No creators match these filters. Try widening your search.
        </p>
      ) : (
        <div className="creator-grid" style={{ marginTop: 16 }}>
          {list.map((c) => {
            const plats = (c.platforms || "")
              .split(",")
              .map((p) => p.trim())
              .filter(Boolean);
            const tags = (c.interests || "")
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
              .slice(0, 3);
            const state = invited[c.id];
            const initial = (c.name || c.username || "S")[0].toUpperCase();
            return (
              <div className="creator-card" key={c.id}>
                <div className="cc-head">
                  {c.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="cc-avatar" src={c.image} alt={c.name || "Creator"} />
                  ) : (
                    <div className="cc-avatar cc-avatar-fallback">{initial}</div>
                  )}
                  <div className="cc-id">
                    <b>{c.name || "Creator"}</b> <TrustBadge verified={c.isVerified} />
                    {c.username && <span className="cc-user">@{c.username}</span>}
                    {plats.length > 0 && (
                      <div className="cc-plats">
                        {plats.map((p) => (
                          <span className="cc-plat" key={p}>
                            {PLAT_EMOJI[p] || "🌐"} {p}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="cc-stats">
                  <div className="cc-stat">
                    <div className="cc-num">{num(c.followers)}</div>
                    <div className="cc-lbl">Followers</div>
                  </div>
                  <div className="cc-stat">
                    <div className="cc-num">{num(c.avgViews)}</div>
                    <div className="cc-lbl">Avg views</div>
                  </div>
                  <div className="cc-stat">
                    <div className="cc-num">{Number(c.engagementRate || 0)}%</div>
                    <div className="cc-lbl">Engagement</div>
                  </div>
                </div>

                <div className="cc-meta">
                  <span>✅ {num(c.approved)} approved</span>
                  <span>💰 ${num(c.earnings)} earned</span>
                </div>

                {tags.length > 0 && (
                  <div className="cc-tags">
                    {tags.map((t) => (
                      <span className="cc-tag" key={t}>{t}</span>
                    ))}
                  </div>
                )}

                <div className="cc-actions">
                  <Link href={`/creator/${c.id}`} className="btn btn-ghost">
                    View profile
                  </Link>
                  <button
                    className="btn btn-primary"
                    disabled={state === "sending" || state === "sent"}
                    onClick={() => invite(c)}
                  >
                    {state === "sent"
                      ? "Invited ✓"
                      : state === "sending"
                      ? "Sending…"
                      : state === "error"
                      ? "Retry"
                      : "Invite to Campaign"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
