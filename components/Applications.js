"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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

function num(n) {
  return Number(n || 0).toLocaleString();
}

/**
 * Brand "Applications" — a business-framed view of the submissions creators
 * have sent to this brand's campaigns (via the brand-scoped /api/review). Each
 * row shows the creator's reach/engagement and the campaign offer; Approve /
 * Reject run through the real review pipeline, Message opens the inbox thread.
 */
export default function Applications() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState("");

  async function load() {
    try {
      const res = await fetch("/api/review");
      if (!res.ok) {
        setErr("Could not load applications.");
        setRows([]);
        return;
      }
      const data = await res.json();
      setRows(data.submissions || []);
    } catch {
      setErr("Network error while loading applications.");
      setRows([]);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function setStatus(id, status) {
    setBusy(id + status);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: id, status }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setRows((prev) =>
          prev.map((r) =>
            r.id === id
              ? { ...r, status, reward: data.reward != null ? data.reward : r.reward }
              : r
          )
        );
      }
    } catch {
      /* ignore — button just won't update */
    } finally {
      setBusy("");
    }
  }

  if (rows === null) return <p className="brief">Loading applications…</p>;
  if (err && rows.length === 0) return <p className="brief">{err}</p>;

  const counts = {
    all: rows.length,
    pending: rows.filter((r) => r.status === "pending").length,
    approved: rows.filter((r) => r.status === "approved").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
  };
  const shown = filter === "all" ? rows : rows.filter((r) => r.status === filter);

  return (
    <>
      <div className="review-filters">
        {["all", "pending", "approved", "rejected"].map((f) => (
          <button
            key={f}
            className={`platform-chip ${filter === f ? "active" : ""}`}
            onClick={() => setFilter(f)}
          >
            <span style={{ textTransform: "capitalize" }}>{f}</span> ({counts[f]})
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="brief" style={{ marginTop: 18 }}>
          No applications here yet.
        </p>
      ) : (
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Creator</th>
                <th>Campaign</th>
                <th>Followers</th>
                <th>Avg views</th>
                <th>Engagement</th>
                <th>Offer</th>
                <th>Applied</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.creatorId ? (
                      <Link
                        href={`/creator/${r.creatorId}`}
                        style={{ color: "var(--text)", fontWeight: 600 }}
                      >
                        {r.creatorName || "Unknown"}
                      </Link>
                    ) : (
                      <b>{r.creatorName || "Unknown"}</b>
                    )}
                    <br />
                    <span style={{ color: "var(--text-mute)", fontSize: 12 }}>
                      {PLATFORM_LABEL[r.platform] || r.platform}
                    </span>
                  </td>
                  <td>
                    {r.campaignId ? (
                      <Link href={`/campaign/${r.campaignId}`}>{r.challengeId}</Link>
                    ) : (
                      r.challengeId
                    )}
                    <br />
                    <a
                      href={r.postUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "var(--accent)", fontSize: 12 }}
                    >
                      View content ↗
                    </a>
                  </td>
                  <td>{num(r.creatorFollowers)}</td>
                  <td>{num(r.creatorAvgViews)}</td>
                  <td>{Number(r.creatorEngagementRate || 0)}%</td>
                  <td>${num(r.campaignReward)}</td>
                  <td>{fmtDate(r.createdAt)}</td>
                  <td>
                    <span className={`status ${STATUS_CLASS[r.status] || "review"}`}>
                      {r.status}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        className="btn btn-primary"
                        style={{ padding: "6px 12px", fontSize: 13 }}
                        disabled={r.status === "approved" || busy === r.id + "approved"}
                        onClick={() => setStatus(r.id, "approved")}
                      >
                        Approve
                      </button>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: "6px 12px", fontSize: 13 }}
                        disabled={r.status === "rejected" || busy === r.id + "rejected"}
                        onClick={() => setStatus(r.id, "rejected")}
                      >
                        Reject
                      </button>
                      {r.creatorId && (
                        <Link
                          href={`/dashboard/inbox?to=${r.creatorId}`}
                          className="btn btn-ghost"
                          style={{ padding: "6px 12px", fontSize: 13 }}
                        >
                          Message
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
