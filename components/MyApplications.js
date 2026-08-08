"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

const PLATFORM_LABEL = {
  tiktok: "🎵 TikTok",
  instagram: "📸 Instagram",
  youtube: "▶️ YouTube",
  x: "𝕏 X",
};

const STATUS_CLASS = {
  pending: "review",
  approved: "live",
  rejected: "ended",
};

const STATUS_LABEL = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

function fmtDate(d) {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Creator "My Applications" — a read-only view of every campaign this creator
 * has applied to (submitted a clip to), with its current status. Rows link to
 * the full campaign so they can view details / update their submission. Fed by
 * the server page (no client fetch).
 */
export default function MyApplications({ rows = [] }) {
  const [filter, setFilter] = useState("all");

  const counts = useMemo(
    () => ({
      all: rows.length,
      pending: rows.filter((r) => r.status === "pending").length,
      approved: rows.filter((r) => r.status === "approved").length,
      rejected: rows.filter((r) => r.status === "rejected").length,
    }),
    [rows]
  );

  const shown = filter === "all" ? rows : rows.filter((r) => r.status === filter);

  if (rows.length === 0) {
    return (
      <div className="panel">
        <p className="brief">
          You haven&apos;t applied to any campaigns yet. Head to{" "}
          <Link href="/dashboard/campaigns" style={{ color: "var(--accent)" }}>
            Campaigns
          </Link>{" "}
          to find work and submit your first clip.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="review-filters">
        {["all", "pending", "approved", "rejected"].map((f) => (
          <button
            key={f}
            className={`platform-chip ${filter === f ? "active" : ""}`}
            onClick={() => setFilter(f)}
          >
            <span style={{ textTransform: "capitalize" }}>{f}</span>{" "}
            <span className="chip-count">{counts[f]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="brief" style={{ marginTop: 18 }}>
          No applications in this filter yet.
        </p>
      ) : (
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Applied</th>
                <th>Reward</th>
                <th>Platform</th>
                <th>Status</th>
                <th>View</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                // Approved rows show the actual reward paid; otherwise the
                // campaign's per-post offer.
                const amount =
                  r.status === "approved" && r.reward
                    ? r.reward
                    : r.campaignReward || 0;
                const name = r.campaignTitle || r.challengeId || "Campaign";
                return (
                  <tr key={r.id}>
                    <td><b>{name}</b></td>
                    <td>{fmtDate(r.createdAt)}</td>
                    <td style={{ color: "var(--accent-3)", fontWeight: 700 }}>
                      ${Number(amount).toLocaleString()}
                    </td>
                    <td>{PLATFORM_LABEL[r.platform] || r.platform}</td>
                    <td>
                      <span className={`status ${STATUS_CLASS[r.status] || "review"}`}>
                        {STATUS_LABEL[r.status] || r.status}
                      </span>
                    </td>
                    <td>
                      {r.campaignId ? (
                        <Link
                          href={`/dashboard/campaigns/${r.campaignId}`}
                          style={{ color: "var(--accent)" }}
                        >
                          Open ↗
                        </Link>
                      ) : r.postUrl ? (
                        <a
                          href={r.postUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "var(--accent)" }}
                        >
                          View ↗
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
