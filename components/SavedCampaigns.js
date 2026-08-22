"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import CampaignCard from "@/components/CampaignCard";

/**
 * Client grid for /dashboard/saved. Renders the creator's bookmarked campaigns
 * with a working Save toggle so they can unsave (or re-save) in place. The list
 * itself is fetched server-side; this component only owns the saved-state and the
 * shared ticking clock for each card's countdown.
 *
 * `now` is seeded from a server timestamp so the first client render matches the
 * server HTML, then the real clock takes over after mount (same pattern as
 * CampaignGrid).
 */
export default function SavedCampaigns({ campaigns = [], now: serverNow }) {
  const [now, setNow] = useState(serverNow ?? 0);
  // Everything on this page starts saved. Unsaving flips the card to "＋ Save"
  // (undo-friendly); the row is gone on the next load.
  const [savedIds, setSavedIds] = useState(() => new Set(campaigns.map((c) => c.id)));

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

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
      // Revert the optimistic toggle if the request failed.
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (isSaved) next.add(id);
        else next.delete(id);
        return next;
      });
    }
  }

  if (campaigns.length === 0) {
    return (
      <div className="panel">
        <p className="brief">
          You haven&apos;t saved any campaigns yet. Browse{" "}
          <Link href="/dashboard/campaigns" style={{ color: "var(--accent)" }}>
            Campaigns
          </Link>{" "}
          and tap <b>Save</b> to bookmark the ones you want to come back to.
        </p>
      </div>
    );
  }

  return (
    <div className="camp-grid" style={{ marginTop: 16 }}>
      {campaigns.map((c) => (
        <CampaignCard
          key={c.id}
          c={c}
          now={now}
          saved={savedIds.has(c.id)}
          onToggleSave={toggleSave}
        />
      ))}
    </div>
  );
}
