"use client";

import { useEffect, useState } from "react";
import CampaignCard from "@/components/CampaignCard";

/**
 * Creator view of /dashboard/campaigns — a grid of brand campaigns to browse
 * and join, rendered with the shared GIMI-style CampaignCard (thumbnail badge,
 * Budget + live countdown overlay, Approval / Performance / Spotlight pills).
 * Live campaigns sort above finished ones (the API already orders them).
 */
export default function BrowseCampaigns() {
  const [rows, setRows] = useState(null);
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
        <CampaignCard key={c.id} c={c} now={now} />
      ))}
    </div>
  );
}
