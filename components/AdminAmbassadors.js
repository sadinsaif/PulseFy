"use client";

import { Fragment, useState } from "react";

const PLATFORM_LABEL = {
  tiktok: "🎵 TikTok",
  instagram: "📸 Instagram",
  youtube: "▶️ YouTube",
  x: "𝕏 X",
  other: "🌐 Other",
};

const AUDIENCE_LABEL = {
  "0-1k": "0–1K",
  "1k-10k": "1K–10K",
  "10k-50k": "10K–50K",
  "50k-250k": "50K–250K",
  "250k+": "250K+",
};

// Application status → the shared .status pill colour. under_review/submitted
// are in-progress (review), approved is positive (live), rejected/draft closed.
const STATUS_CLASS = {
  submitted: "review",
  under_review: "review",
  approved: "live",
  rejected: "ended",
  draft: "ended",
};

const STATUS_LABEL = {
  submitted: "Submitted",
  under_review: "Under review",
  approved: "Approved",
  rejected: "Rejected",
  draft: "Draft",
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "under_review", label: "Under review" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

function fmtDate(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

function cap(s) {
  if (!s) return "—";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Admin Ambassador review console. The server passes the real applications in
 * via `initialRows`; this client component holds them in state so Approve /
 * Reject / Under review update the row in place (optimistic) after
 * PATCH /api/ambassador/[id]. Reuses the existing table/filter/search styling —
 * no new CSS.
 */
export default function AdminAmbassadors({ initialRows = [] }) {
  const [rows, setRows] = useState(initialRows);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState("");
  const [busy, setBusy] = useState("");
  const [notes, setNotes] = useState({}); // per-application private note draft

  const counts = {
    all: rows.length,
    under_review: rows.filter(
      (r) => r.status === "under_review" || r.status === "submitted"
    ).length,
    approved: rows.filter((r) => r.status === "approved").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
  };

  const needle = q.trim().toLowerCase();
  const shown = rows
    .filter((r) => {
      if (filter === "all") return true;
      if (filter === "under_review")
        return r.status === "under_review" || r.status === "submitted";
      return r.status === filter;
    })
    .filter((r) =>
      !needle
        ? true
        : (r.name || "").toLowerCase().includes(needle) ||
          (r.email || "").toLowerCase().includes(needle) ||
          (r.handle || "").toLowerCase().includes(needle) ||
          (r.country || "").toLowerCase().includes(needle)
    );

  async function review(id, status) {
    setBusy(id + status);
    try {
      const res = await fetch(`/api/ambassador/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reviewerNote: notes[id] || "" }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const app = data.application || {};
        setRows((prev) =>
          prev.map((r) =>
            r.id === id
              ? {
                  ...r,
                  status: app.status || status,
                  reviewerNote: app.reviewerNote ?? (notes[id] || null),
                  reviewedAt: app.reviewedAt ?? r.reviewedAt,
                }
              : r
          )
        );
      }
    } catch {
      /* ignore — the button simply won't update */
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Ambassador applications</h3>
      </div>

      <div className="search-bar" style={{ marginTop: 12 }}>
        <span className="search-ic">🔍</span>
        <input
          type="text"
          placeholder="Search by name, email, handle or country…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="review-filters" style={{ marginTop: 12 }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`platform-chip ${filter === f.key ? "active" : ""}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label} <span className="chip-count">{counts[f.key]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="brief" style={{ marginTop: 10 }}>
          {rows.length === 0
            ? "No Ambassador applications yet."
            : "No applications match this filter."}
        </p>
      ) : (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Applicant</th>
                <th>Country</th>
                <th>Platform</th>
                <th>Handle</th>
                <th>Audience</th>
                <th>Category</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const open = openId === r.id;
                const decided = r.status === "approved" || r.status === "rejected";
                return (
                  <Fragment key={r.id}>
                    <tr>
                      <td>
                        <b>{r.name || "Applicant"}</b>
                        <br />
                        <span style={{ color: "var(--text-mute)", fontSize: 12 }}>
                          {r.email}
                        </span>
                        <br />
                        <button
                          className="u"
                          style={{
                            background: "none",
                            border: 0,
                            padding: 0,
                            cursor: "pointer",
                            color: "var(--accent)",
                            fontSize: 12,
                          }}
                          onClick={() => setOpenId(open ? "" : r.id)}
                        >
                          {open ? "Hide details ▴" : "View details ▾"}
                        </button>
                      </td>
                      <td>{r.country || "—"}</td>
                      <td>{PLATFORM_LABEL[r.platform] || cap(r.platform)}</td>
                      <td>
                        {r.socialLink ? (
                          <a
                            href={r.socialLink}
                            target="_blank"
                            rel="noreferrer"
                            className="u"
                            style={{ color: "var(--accent)" }}
                          >
                            {r.handle} ↗
                          </a>
                        ) : (
                          r.handle || "—"
                        )}
                      </td>
                      <td>{AUDIENCE_LABEL[r.audienceSize] || r.audienceSize || "—"}</td>
                      <td>{cap(r.contentCategory)}</td>
                      <td>
                        <span className={`status ${STATUS_CLASS[r.status] || "review"}`}>
                          {STATUS_LABEL[r.status] || r.status}
                        </span>
                      </td>
                      <td>{fmtDate(r.submittedAt)}</td>
                      <td>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <button
                            className="btn btn-primary"
                            style={{ padding: "6px 12px", fontSize: 13 }}
                            disabled={r.status === "approved" || busy === r.id + "approved"}
                            onClick={() => review(r.id, "approved")}
                          >
                            Approve
                          </button>
                          <button
                            className="btn btn-ghost"
                            style={{ padding: "6px 12px", fontSize: 13 }}
                            disabled={r.status === "rejected" || busy === r.id + "rejected"}
                            onClick={() => review(r.id, "rejected")}
                          >
                            Reject
                          </button>
                          {decided ? (
                            <button
                              className="btn btn-ghost btn-sm"
                              disabled={busy === r.id + "under_review"}
                              onClick={() => review(r.id, "under_review")}
                              title="Put back under review"
                            >
                              ↺ Reopen
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    {open ? (
                      <tr>
                        <td colSpan={9} style={{ background: "var(--card-2, rgba(255,255,255,0.02))" }}>
                          <div style={{ padding: "4px 2px 10px" }}>
                            <p className="brief" style={{ margin: "0 0 6px" }}>
                              <b>Why they&apos;d be a good fit</b>
                            </p>
                            <p style={{ margin: "0 0 12px", whiteSpace: "pre-wrap", color: "var(--text)" }}>
                              {r.reason || "—"}
                            </p>
                            <p className="brief" style={{ margin: "0 0 12px" }}>
                              Referral source: {cap(r.referralSource)} · Reviewed:{" "}
                              {fmtDate(r.reviewedAt)}
                            </p>
                            <label
                              className="brief"
                              style={{ display: "block", margin: "0 0 4px" }}
                            >
                              Private note (optional — saved with the next decision)
                            </label>
                            <textarea
                              rows={2}
                              maxLength={2000}
                              placeholder="Internal note for the team…"
                              value={notes[r.id] ?? (r.reviewerNote || "")}
                              onChange={(e) =>
                                setNotes((p) => ({ ...p, [r.id]: e.target.value }))
                              }
                              style={{ width: "100%", maxWidth: 520 }}
                            />
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

