"use client";

import { useState } from "react";

// Derived activity label — a brand with ≥1 active campaign is "Active",
// otherwise "Idle". This is a read-only label, NOT a moderation status: there
// is no users.status column and no suspend/activate action (view-only, per the
// agreed scope).
const STATUS_CLASS = { Active: "live", Idle: "review" };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "idle", label: "Idle" },
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
 * Admin brand-management table. Pure display of real aggregates — search +
 * activity filter, no mutations. Reuses the existing Leaderboard/BrandCampaigns
 * styling (search-bar, review-filters, table-wrap) so no new CSS is needed.
 */
export default function AdminBrands({ rows = [] }) {
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");

  const withStatus = rows.map((r) => ({
    ...r,
    status: r.active > 0 ? "Active" : "Idle",
  }));

  const counts = {
    all: withStatus.length,
    active: withStatus.filter((r) => r.status === "Active").length,
    idle: withStatus.filter((r) => r.status === "Idle").length,
  };

  const needle = q.trim().toLowerCase();
  const shown = withStatus
    .filter((r) =>
      filter === "all"
        ? true
        : filter === "active"
        ? r.status === "Active"
        : r.status === "Idle"
    )
    .filter((r) =>
      !needle
        ? true
        : (r.name || "").toLowerCase().includes(needle) ||
          (r.company || "").toLowerCase().includes(needle) ||
          (r.email || "").toLowerCase().includes(needle)
    );

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>All brands</h3>
      </div>

      <div className="search-bar" style={{ marginTop: 12 }}>
        <span className="search-ic">🔍</span>
        <input
          type="text"
          placeholder="Search by brand, company or email…"
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
            ? "No brands have signed up yet."
            : "No brands match this filter."}
        </p>
      ) : (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Brand</th>
                <th>Email</th>
                <th>Campaigns</th>
                <th>Active</th>
                <th>Total spend</th>
                <th>Status</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td><b>{r.name || r.company || "Brand"}</b></td>
                  <td>{r.email || "—"}</td>
                  <td>{r.campaigns.toLocaleString()}</td>
                  <td>{r.active.toLocaleString()}</td>
                  <td style={{ color: "var(--accent-3)", fontWeight: 700 }}>
                    ${r.spend.toLocaleString()}
                  </td>
                  <td>
                    <span className={`status ${STATUS_CLASS[r.status] || "review"}`}>
                      {r.status}
                    </span>
                  </td>
                  <td>{fmtDate(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
