"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import RichCampaignForm from "@/components/RichCampaignForm";

const STATUS_CLASS = { active: "live", paused: "review", ended: "ended" };

// Filter tabs — the real campaign enum (no "draft" status exists).
const FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "paused", label: "Paused" },
  { key: "ended", label: "Ended" },
];

/**
 * Brand view of /dashboard/campaigns — create a campaign with a GIMI-style
 * rich form, and manage the ones you own (pause / resume / end). The table
 * shows the full business picture: budget, amount spent, applications (pending
 * submissions), creators selected, total submissions, approved content, views.
 * Opening the page with ?new=1 auto-opens the create form.
 */
export default function BrandCampaigns() {
  const [rows, setRows] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("all");

  async function load() {
    try {
      const res = await fetch("/api/campaigns?mine=1");
      const data = await res.json();
      setRows(res.ok ? data.campaigns || [] : []);
    } catch {
      setRows([]);
    }
  }

  useEffect(() => {
    load();
    // ?new=1 (e.g. the Overview "+ Create Campaign" button) opens the form.
    try {
      if (new URLSearchParams(window.location.search).get("new") === "1") {
        setShowForm(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  async function setStatus(id, status) {
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
      }
    } catch {
      /* ignore */
    }
  }

  const list = rows || [];
  const counts = {
    all: list.length,
    active: list.filter((c) => c.status === "active").length,
    paused: list.filter((c) => c.status === "paused").length,
    ended: list.filter((c) => c.status === "ended").length,
  };
  const shown = filter === "all" ? list : list.filter((c) => c.status === filter);

  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <h3>Your campaigns</h3>
          <button
            className="btn btn-primary"
            style={{ padding: "8px 16px", fontSize: 14 }}
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Close" : "+ New campaign"}
          </button>
        </div>

        {showForm && (
          <RichCampaignForm
            onCancel={() => setShowForm(false)}
            onSuccess={() => {
              setShowForm(false);
              load();
            }}
          />
        )}
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="panel-head">
          <h3>Live &amp; past campaigns</h3>
          <Link href="/dashboard/applications" style={{ color: "var(--accent)" }}>
            Review applications →
          </Link>
        </div>

        {/* Status filter tabs with live counts */}
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

        {rows === null ? (
          <p className="brief" style={{ marginTop: 10 }}>Loading…</p>
        ) : shown.length === 0 ? (
          <p className="brief" style={{ marginTop: 10 }}>
            {list.length === 0
              ? "No campaigns yet. Click + New campaign to launch your first one."
              : "No campaigns match this filter."}
          </p>
        ) : (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Status</th>
                  <th>Budget</th>
                  <th>Amount spent</th>
                  <th>Applications</th>
                  <th>Creators selected</th>
                  <th>Submissions</th>
                  <th>Approved content</th>
                  <th>Views</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/campaign/${c.id}`}><b>{c.title}</b></Link>
                    </td>
                    <td>
                      <span className={`status ${STATUS_CLASS[c.status] || "review"}`}>
                        {c.status}
                      </span>
                    </td>
                    <td>
                      {c.budget > 0 ? `$${Number(c.budget).toLocaleString()}` : "—"}
                    </td>
                    <td>${Number(c.budgetSpent || 0).toLocaleString()}</td>
                    <td>{Number(c.pendingCount ?? 0).toLocaleString()}</td>
                    <td>{Number(c.creatorsSelected ?? 0).toLocaleString()}</td>
                    <td>{Number(c.submissionCount ?? 0).toLocaleString()}</td>
                    <td>{Number(c.approvedCount ?? 0).toLocaleString()}</td>
                    <td>{Number(c.totalViews ?? 0).toLocaleString()}</td>
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
    </>
  );
}
