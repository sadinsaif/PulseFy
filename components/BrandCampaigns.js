"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import RichCampaignForm from "@/components/RichCampaignForm";
import { budgetLeft } from "@/lib/campaign";

const PLABEL = {
  any: "Any platform",
  tiktok: "🎵 TikTok",
  instagram: "📸 Instagram",
  youtube: "▶️ YouTube",
  x: "𝕏 X",
};
const STATUS_CLASS = { active: "live", paused: "review", ended: "ended" };

/**
 * Brand view of /dashboard/campaigns — create a campaign with a GIMI-style
 * rich form, and manage the ones you own (pause / resume / end), with a live
 * submission count and a link to review incoming clips.
 */
export default function BrandCampaigns() {
  const [rows, setRows] = useState(null);
  const [showForm, setShowForm] = useState(false);

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
          <Link href="/dashboard/submissions" style={{ color: "var(--accent)" }}>
            Review submissions →
          </Link>
        </div>

        {rows === null ? (
          <p className="brief" style={{ marginTop: 10 }}>Loading…</p>
        ) : rows.length === 0 ? (
          <p className="brief" style={{ marginTop: 10 }}>
            No campaigns yet. Click <b>+ New campaign</b> to launch your first one.
          </p>
        ) : (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Platform</th>
                  <th>Budget</th>
                  <th>Reward</th>
                  <th>Submissions</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td><b>{c.title}</b></td>
                    <td>{PLABEL[c.platform] || c.platform}</td>
                    <td>
                      {c.budget > 0 ? (
                        <>
                          ${Number(budgetLeft(c)).toLocaleString()}
                          <span style={{ color: "var(--text-mute)", fontSize: 12 }}>
                            {" "}/ ${Number(c.budget).toLocaleString()}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>${c.reward}/post</td>
                    <td>{c.submissionCount ?? 0}</td>
                    <td>
                      <span className={`status ${STATUS_CLASS[c.status] || "review"}`}>
                        {c.status}
                      </span>
                    </td>
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
