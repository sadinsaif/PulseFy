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
  const [rewards, setRewards] = useState({}); // per-submission $ input
  const [metrics, setMetrics] = useState({}); // per-submission { views, engagement }
  const [spotBonus, setSpotBonus] = useState({}); // per-submission spotlight $ input
  const [reasons, setReasons] = useState({}); // per-submission reject reason (optional)

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
      const payload = { submissionId: id, status };
      if (status === "approved") {
        const r = Number(rewards[id]);
        payload.reward = Number.isFinite(r) && r >= 0 ? Math.floor(r) : 0;
      }
      // Send the admin-verified metrics on any action so views/engagement
      // stay real. Fall back to the row's current value when the input is empty.
      const row = rows.find((x) => x.id === id) || {};
      const vRaw = metrics[id]?.views ?? row.views ?? "";
      const eRaw = metrics[id]?.engagement ?? row.engagement ?? "";
      const v = Number(vRaw);
      const e = Number(eRaw);
      if (vRaw !== "" && Number.isFinite(v) && v >= 0) payload.views = Math.floor(v);
      if (eRaw !== "" && Number.isFinite(e) && e >= 0) payload.engagement = Math.floor(e);
      // Optional free-text note the creator sees on reject. Only sent on reject.
      if (status === "rejected") payload.reason = (reasons[id] || "").trim();
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setRows((prev) =>
          prev.map((r) =>
            r.id === id
              ? {
                  ...r,
                  status,
                  reward: data.reward != null ? data.reward : r.reward,
                  views: payload.views != null ? payload.views : r.views,
                  engagement:
                    payload.engagement != null ? payload.engagement : r.engagement,
                  rejectionReason:
                    status === "rejected" ? payload.reason || null : null,
                }
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

  // Toggle a spotlight on/off. Keeps the current status so no re-review happens;
  // sends the flexible bonus the admin typed. Turning it off clears the bonus.
  async function sendSpotlight(id, on) {
    setBusy(id + "spot");
    try {
      const row = rows.find((x) => x.id === id) || {};
      const payload = { submissionId: id, status: row.status, spotlighted: on };
      if (on) {
        const b = Number(spotBonus[id] ?? row.spotlightBonus);
        payload.spotlightBonus = Number.isFinite(b) && b >= 0 ? Math.floor(b) : 0;
      }
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setRows((prev) =>
          prev.map((r) =>
            r.id === id
              ? {
                  ...r,
                  spotlighted: data.spotlighted != null ? data.spotlighted : on,
                  spotlightBonus:
                    data.spotlightBonus != null ? data.spotlightBonus : r.spotlightBonus,
                }
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
                <th>Views</th>
                <th>Engagement</th>
                <th>Status</th>
                <th>Spotlight</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.creatorId ? (
                      <Link href={`/creator/${r.creatorId}`} className="u" style={{ color: "var(--text)", fontWeight: 600 }}>
                        {r.creatorName || "Unknown"}
                      </Link>
                    ) : (
                      <b>{r.creatorName || "Unknown"}</b>
                    )}
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
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      className="metric-input"
                      value={metrics[r.id]?.views ?? (r.views || "")}
                      onChange={(e) =>
                        setMetrics((p) => ({
                          ...p,
                          [r.id]: { ...p[r.id], views: e.target.value },
                        }))
                      }
                      title="Verified post views"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      className="metric-input"
                      value={metrics[r.id]?.engagement ?? (r.engagement || "")}
                      onChange={(e) =>
                        setMetrics((p) => ({
                          ...p,
                          [r.id]: { ...p[r.id], engagement: e.target.value },
                        }))
                      }
                      title="Verified engagement (likes + comments + shares)"
                    />
                  </td>
                  <td>
                    <span className={`status ${STATUS_CLASS[r.status] || "review"}`}>
                      {r.status}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <div className="reward-input" title="Spotlight bonus (USD)">
                        <span>$</span>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={spotBonus[r.id] ?? (r.spotlightBonus || "")}
                          onChange={(e) =>
                            setSpotBonus((p) => ({ ...p, [r.id]: e.target.value }))
                          }
                          disabled={r.spotlighted}
                        />
                      </div>
                      <button
                        className={`btn btn-sm ${r.spotlighted ? "btn-spotlight-on" : "btn-ghost"}`}
                        disabled={busy === r.id + "spot"}
                        onClick={() => sendSpotlight(r.id, !r.spotlighted)}
                        title={
                          r.spotlighted
                            ? "Remove spotlight"
                            : "Spotlight this post and grant the bonus"
                        }
                      >
                        {r.spotlighted ? "✦ Spotlighted" : "✦ Spotlight"}
                      </button>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <div className="reward-input">
                          <span>$</span>
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={rewards[r.id] ?? (r.reward || "")}
                            onChange={(e) =>
                              setRewards((p) => ({ ...p, [r.id]: e.target.value }))
                            }
                            title="Reward for this post (USD)"
                          />
                        </div>
                        <button
                          className="btn btn-primary"
                          style={{ padding: "6px 12px", fontSize: 13 }}
                          disabled={busy === r.id + "approved"}
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
                      <input
                        type="text"
                        maxLength={300}
                        placeholder="Reason (optional, shown to creator on reject)"
                        className="metric-input"
                        style={{ width: "100%", minWidth: 180 }}
                        value={reasons[r.id] ?? (r.rejectionReason || "")}
                        onChange={(e) =>
                          setReasons((p) => ({ ...p, [r.id]: e.target.value }))
                        }
                        title="Optional note the creator sees when you reject this post"
                      />
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
