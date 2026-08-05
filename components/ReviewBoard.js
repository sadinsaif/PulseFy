"use client";

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

/**
 * Submissions review board. Loads every submission from /api/review and lets
 * the brand owner approve or reject each one. Client component so the buttons
 * update the list in place without a full reload.
 */
export default function ReviewBoard() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState("");

  async function load() {
    try {
      const res = await fetch("/api/review");
      if (!res.ok) {
        setErr("Could not load submissions.");
        return;
      }
      const data = await res.json();
      setRows(data.submissions || []);
    } catch {
      setErr("Network error while loading submissions.");
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
        setRows((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status } : r))
        );
      }
    } catch {
      /* ignore — button just won't update */
    } finally {
      setBusy("");
    }
  }

  if (err) return <div className="alert err">{err}</div>;
  if (rows === null) return <p className="brief">Loading submissions…</p>;

  const counts = {
    all: rows.length,
    pending: rows.filter((r) => r.status === "pending").length,
    approved: rows.filter((r) => r.status === "approved").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
  };

  const shown =
    filter === "all" ? rows : rows.filter((r) => r.status === filter);

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
          No submissions here yet.
        </p>
      ) : (
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Creator</th>
                <th>Challenge</th>
                <th>Platform</th>
                <th>Post</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td>
                    <b>{r.creatorName || "Unknown"}</b>
                    <br />
                    <span style={{ color: "var(--text-mute)", fontSize: 12 }}>
                      {r.creatorEmail}
                    </span>
                  </td>
                  <td>{r.challengeId}</td>
                  <td>{PLATFORM_LABEL[r.platform] || r.platform}</td>
                  <td>
                    <a
                      href={r.postUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="u"
                      style={{ color: "var(--accent)" }}
                    >
                      Open link ↗
                    </a>
                    {r.caption ? (
                      <div style={{ color: "var(--text-mute)", fontSize: 12, marginTop: 4, maxWidth: 220 }}>
                        {r.caption}
                      </div>
                    ) : null}
                  </td>
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
