"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Creator discovery — a search box over all creators plus a grid of cards.
 * Clicking a card opens that creator's public profile at /creator/[id].
 */
export default function CreatorsDirectory() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/creators?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setRows(res.ok ? data.creators || [] : []);
      } catch {
        setRows([]);
      }
    }, 250); // debounce typing
    return () => clearTimeout(t);
  }, [q]);

  return (
    <>
      <div className="search-bar">
        <span className="search-ic">🔍</span>
        <input
          autoFocus
          placeholder="Search creators by name or @username…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {rows === null ? (
        <p className="brief">Loading creators…</p>
      ) : rows.length === 0 ? (
        <div className="panel">
          <p className="brief">
            {q ? `No creators match “${q}”.` : "No creators yet."}
          </p>
        </div>
      ) : (
        <div className="creator-grid">
          {rows.map((c) => {
            const initial = (c.name || c.username || "S")[0].toUpperCase();
            return (
              <Link key={c.id} href={`/creator/${c.id}`} className="creator-card">
                {c.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="cc-av img" src={c.image} alt={c.name} />
                ) : (
                  <div
                    className="cc-av"
                    style={{ background: "linear-gradient(135deg,#ffb43a,#ff7a45)" }}
                  >
                    {initial}
                  </div>
                )}
                <div className="cc-body">
                  <b>{c.name || "Creator"}</b>
                  {c.username && <span className="cc-user">@{c.username}</span>}
                  {c.bio && <p className="cc-bio">{c.bio}</p>}
                </div>
                <div className="cc-stats">
                  <div>
                    <span className="n">{c.approved ?? 0}</span>
                    <span className="l">approved</span>
                  </div>
                  <div>
                    <span className="n" style={{ color: "var(--accent-3)" }}>
                      ${c.earnings ?? 0}
                    </span>
                    <span className="l">earned</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
