"use client";

import Link from "next/link";
import { useState } from "react";
import CampaignFundingControl from "@/components/CampaignFundingControl";

const STATUS_CLASS = { active: "live", paused: "review", ended: "ended" };

// Filter tabs — the real campaign enum (no "draft" status exists).
const FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "paused", label: "Paused" },
  { key: "ended", label: "Ended" },
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
 * Admin view of /dashboard/campaigns — the platform-wide campaign control
 * center. Lists EVERY campaign (initial rows are server-rendered) with the same
 * business aggregates the brand table shows, plus the owning brand. Admins can
 * pause / end / reactivate any campaign via PATCH /api/campaigns/[id] (already
 * admin-allowed). No create/edit here — brands own campaign creation; admins
 * manage. Reuses the exact BrandCampaigns styling (no new CSS).
 */
export default function AdminCampaigns({ rows = [] }) {
  const [list, setList] = useState(rows);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");

  async function setStatus(id, status) {
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setList((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
      }
    } catch {
      /* ignore */
    }
  }

  const counts = {
    all: list.length,
    active: list.filter((c) => c.status === "active").length,
    paused: list.filter((c) => c.status === "paused").length,
    ended: list.filter((c) => c.status === "ended").length,
  };

  const needle = q.trim().toLowerCase();
  const shown = list
    .filter((c) => (filter === "all" ? true : c.status === filter))
    .filter((c) =>
      !needle
        ? true
        : (c.title || "").toLowerCase().includes(needle) ||
          (c.brandName || "").toLowerCase().includes(needle)
    );

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>All campaigns</h3>
        <Link href="/dashboard/submissions" style={{ color: "var(--accent)" }}>
          Review submissions →
        </Link>
      </div>

      {/* Search + status filter tabs with live counts */}
      <div className="search-bar" style={{ marginTop: 12 }}>
        <span className="search-ic">🔍</span>
        <input
          type="text"
          placeholder="Search by campaign or brand…"
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
          {list.length === 0
            ? "No campaigns on the platform yet."
            : "No campaigns match this filter."}
        </p>
      ) : (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Brand</th>
                <th>Status</th>
                <th>Budget</th>
                <th>Verified funding</th>
                <th>Amount spent</th>
                <th>Applications</th>
                <th>Creators selected</th>
                <th>Submissions</th>
                <th>Approved content</th>
                <th>Views</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/campaign/${c.id}`}><b>{c.title}</b></Link>
                  </td>
                  <td>{c.brandName || "—"}</td>
                  <td>
                    <span className={`status ${STATUS_CLASS[c.status] || "review"}`}>
                      {c.status}
                    </span>
                  </td>
                  <td>
                    {c.budget > 0 ? `$${Number(c.budget).toLocaleString()}` : "—"}
                  </td>
                  <td><CampaignFundingControl campaign={c} /></td>
                  <td>${Number(c.budgetSpent || 0).toLocaleString()}</td>
                  <td>{Number(c.pendingCount ?? 0).toLocaleString()}</td>
                  <td>{Number(c.creatorsSelected ?? 0).toLocaleString()}</td>
                  <td>{Number(c.submissionCount ?? 0).toLocaleString()}</td>
                  <td>{Number(c.approvedCount ?? 0).toLocaleString()}</td>
                  <td>{Number(c.totalViews ?? 0).toLocaleString()}</td>
                  <td>{fmtDate(c.createdAt)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      {c.status !== "active" && (
                        <button className="btn btn-ghost" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => setStatus(c.id, "active")}>Activate</button>
                      )}
                      {c.status === "active" && (
                        <button className="btn btn-ghost" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => setStatus(c.id, "paused")}>Pause</button>
                      )}
                      {c.status !== "ended" && (
                        <button className="btn btn-ghost" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => setStatus(c.id, "ended")}>End</button>
                      )}
                    </div>
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
