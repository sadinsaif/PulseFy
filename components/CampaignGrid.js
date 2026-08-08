"use client";

import { useEffect, useState } from "react";
import CampaignCard from "@/components/CampaignCard";

/**
 * A grid of GIMI-style campaign cards with a single shared ticking clock, so
 * every card's countdown stays fresh (updated once a minute) without each card
 * mounting its own timer. Used by the Overview feed; the campaign list is
 * passed in from a server component.
 *
 * `now` is seeded from a server-provided timestamp so the first client render
 * matches the server HTML exactly (no Live→End flip or countdown hydration
 * warning); the real client clock takes over after mount and ticks each minute.
 */
export default function CampaignGrid({ campaigns, style, now: serverNow }) {
  const [now, setNow] = useState(serverNow ?? 0);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="camp-grid" style={style}>
      {campaigns.map((c) => (
        <CampaignCard key={c.id} c={c} now={now} />
      ))}
    </div>
  );
}
