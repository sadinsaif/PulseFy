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

// Compact number: 5400 → "5.4K", 2100000 → "2.1M".
function fmtCompact(n) {
  const v = Math.round(Number(n) || 0);
  if (v >= 999_950_000) return (v / 1_000_000_000).toFixed(1) + "B";
  if (v >= 999_950) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 999.95) return (v / 1_000).toFixed(1) + "K";
  return String(v);
}

/**
 * Public "Spotlighted" showcase (GIMI-style). Renders the posts an admin
 * highlighted: a ✦ star badge, the creator's avatar + name (links to their
 * profile), the platform, live view count, and the earned bonus badge.
 * Data comes from /api/spotlight. Renders nothing until at least one post is
 * spotlighted, so the section stays clean before the first pick.
 *
 * Pass `campaignId` to scope the list to a single campaign's spotlighted posts
 * (used at the bottom of the campaign detail page).
 */
export default function Spotlighted({ campaignId }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const url = campaignId
          ? `/api/spotlight?campaignId=${encodeURIComponent(campaignId)}`
          : "/api/spotlight";
        const res = await fetch(url);
        if (!res.ok) {
          setRows([]);
          return;
        }
        const data = await res.json();
        setRows(data.spotlights || []);
      } catch {
        setRows([]);
      }
    })();
  }, [campaignId]);

  // Hide the whole section until there's something to show.
  if (!rows || rows.length === 0) return null;

  return (
    <section className="panel spotlight-panel">
      <div className="panel-head">
        <h3>
          <span className="spot-star">✦</span> Spotlighted
        </h3>
        <span className="brief" style={{ fontSize: 13 }}>
          Standout posts, hand-picked and rewarded
        </span>
      </div>

      <div className="spot-grid" style={{ marginTop: 14 }}>
        {rows.map((s) => {
          const initial = (s.creatorName || s.creatorUsername || "S")[0].toUpperCase();
          return (
            <div key={s.id} className="spot-card">
              <div className="spot-card-top">
                <span className="spot-flag">✦</span>
                {s.spotlightBonus > 0 && (
                  <span className="spot-earn">+${s.spotlightBonus}</span>
                )}
              </div>

              <a
                href={s.postUrl}
                target="_blank"
                rel="noreferrer"
                className="spot-title"
              >
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
