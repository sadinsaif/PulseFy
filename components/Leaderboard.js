"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Leaderboard — every creator ranked by total dollars earned, highest first.
 * The /api/creators endpoint already returns rows ordered by earnings desc
 * (then approved-count as a tiebreaker), so rank = array index + 1.
 * An optional search box filters the board by name / @username.
 */
export default function Leaderboard({ initialQ = "" }) {
  const [q, setQ] = useState(initialQ);
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

  // Medal for the top 3, plain number after that.
  const rankLabel = (i) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`);

  return (
    <>
      <div className="search-bar">
        <span className="search-ic">🔍</span>
        <input
          placeholder="Search the leaderboard by name or @username…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {rows === null ? (
        <p className="brief">Loading leaderboard…</p>
      ) : rows.length === 0 ? (
        <div className="panel">
          <p className="brief">
            {q ? `No creators match “${q}”.` : "No creators yet."}
          </p>
        </div>
      ) : (
        <div className="lb-list">
          {rows.map((c, i) => {
            const initial = (c.name || c.username || "S")[0].toUpperCase();
            return (
              <Link
                key={c.id}
                href={`/creator/${c.id}`}
                className={`lb-row ${i < 3 ? "top" : ""}`}
              >
                <span className={`lb-rank r${i + 1}`}>{rankLabel(i)}</span>
                {c.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="lb-av img" src={c.image} alt={c.name} />
                ) : (
                  <div
                    className="lb-av"
                    style={{ background: "linear-gradient(135deg,#ffb43a,#ff7a45)" }}
                  >
                    {initial}
                  </div>
                )}
                <div className="lb-who">
                  <b>{c.name || "Creator"}</b>
                  {c.username && <span className="lb-user">@{c.username}</span>}
                </div>
                <div className="lb-meta">
                  <span className="lb-approved">{Number(c.approved ?? 0)} approved</span>
                  <span className="lb-earn">${Number(c.earnings ?? 0).toLocaleString()}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
