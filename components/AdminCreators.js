"use client";

import Link from "next/link";
import { useState } from "react";
import ModerationControls from "@/components/ModerationControls";
import TrustAdminControls from "@/components/TrustAdminControls";

// Derived activity label — a creator with ≥1 approved post is "Active",
// otherwise "New". Read-only label, NOT a moderation status (view-only scope:
// no users.status column, no suspend/activate).
const STATUS_CLASS = { Active: "live", New: "review" };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "new", label: "New" },
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

/**
 * Admin creator-management table. Real aggregates + search + activity filter,
 * no mutations. "View" opens the public creator profile. Reuses the existing
 * search-bar / review-filters / table-wrap styling — no new CSS.
 */
export default function AdminCreators({ rows = [] }) {
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");

  const withStatus = rows.map((r) => ({ ...r, status: r.moderationStatus || "active" }));

  const counts = {
    all: withStatus.length,
    active: withStatus.filter((r) => r.status === "active").length,
    new: withStatus.filter((r) => r.status !== "active").length,
  };

  const needle = q.trim().toLowerCase();
  const shown = withStatus
    .filter((r) =>
      filter === "all"
        ? true
        : filter === "active" ? r.status === "active" : r.status !== "active"
    )
    .filter((r) =>
      !needle
        ? true
        : (r.name || "").toLowerCase().includes(needle) ||
          (r.username || "").toLowerCase().includes(needle) ||
          (r.email || "").toLowerCase().includes(needle) ||
          r.id.toLowerCase().includes(needle)
    );

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>All creators</h3>
      </div>

      <div className="search-bar" style={{ marginTop: 12 }}>
        <span className="search-ic">🔍</span>
        <input
          type="text"
          placeholder="Search by name, @username or email…"
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
            ? "No creators have signed up yet."
            : "No creators match this filter."}
        </p>
      ) : (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Creator</th>
                <th>Creator ID</th>
                <th>Username</th>
                <th>Email</th>
                <th>Submissions</th>
                <th>Approved</th>
                <th>Earnings</th>
                <th>Status</th>
                <th>Warnings</th>
                <th>Joined</th>
                <th>Verification</th><th>Moderation</th>
                <th>View</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td><b>{r.name || "Creator"}</b></td>
                  <td>{r.id}</td>
                  <td>{r.username ? `@${r.username}` : "—"}</td>
                  <td>{r.email || "—"}</td>
                  <td>{r.submissions.toLocaleString()}</td>
                  <td>{r.approved.toLocaleString()}</td>
                  <td style={{ color: "var(--accent-3)", fontWeight: 700 }}>
                    ${r.earnings.toLocaleString()}
                  </td>
                  <td>
                    <span className={`status ${r.status === "banned" ? "ended" : r.status === "suspended" ? "review" : "live"}`}>
                      {r.status}
                    </span>
                  </td>
                  <td>{r.warnings || 0}</td>
                  <td>{fmtDate(r.createdAt)}</td>
                  <td><TrustAdminControls user={r} /></td><td><ModerationControls user={r} compact /></td>
                  <td>
                    <Link href={`/creator/${r.id}`} style={{ color: "var(--accent)" }}>
                      View ↗
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
