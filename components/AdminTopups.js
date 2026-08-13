"use client";

import { useEffect, useState } from "react";

const STATUS_CLASS = {
  pending: "review",
  processing: "review",
  completed: "live",
  failed: "ended",
  cancelled: "ended",
};

function fmtDate(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

/**
 * Admin-only panel listing brand wallet top-up requests. The admin verifies the
 * real payment (bank / crypto / gateway) out-of-band, then Confirms with a
 * payment reference — ONLY that transition credits the brand's Available balance
 * (server-side, derived). Never shows a balance change before confirmation (§4/§5).
 * Mirrors the withdrawals admin panel.
 */
export default function AdminTopups() {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState("");
  const [refs, setRefs] = useState({}); // id -> payment reference input
  const [err, setErr] = useState("");

  async function load() {
    try {
      const res = await fetch("/api/admin/wallet/topups");
      const json = await res.json();
      setRows(res.ok ? json.topups || [] : []);
    } catch {
      setRows([]);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function act(id, status) {
    setErr("");
    const reference = (refs[id] || "").trim();
    if (status === "completed" && reference.length < 3) {
      setErr("Enter a payment reference before confirming.");
      return;
    }
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/wallet/topups/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reference: reference || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setRefs((r) => ({ ...r, [id]: "" }));
        await load();
      } else {
        setErr(json.error || "Could not update the top-up.");
      }
    } finally {
      setBusy("");
    }
  }

  const pending = (rows || []).filter((r) => r.status === "pending" || r.status === "processing");

  return (
    <section className="panel" style={{ marginTop: 18 }}>
      <div className="panel-head">
        <h3>Brand top-up requests</h3>
        {pending.length > 0 && (
          <span className="tag-pill" style={{ background: "rgba(255,180,58,.15)", color: "var(--accent)" }}>
            {pending.length} pending
          </span>
        )}
      </div>

      {err && <div className="alert err" style={{ marginTop: 10 }}>{err}</div>}

      {rows === null ? (
        <p className="brief" style={{ marginTop: 10 }}>Loading…</p>
      ) : rows.length === 0 ? (
        <p className="brief" style={{ marginTop: 10 }}>
          No top-up requests yet. When a brand adds funds, it appears here for you to
          confirm the payment and credit their balance.
        </p>
      ) : (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Brand</th>
                <th>Amount</th>
                <th>Reference</th>
                <th>Status</th>
                <th>Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const actionable = t.status === "pending" || t.status === "processing";
                return (
                  <tr key={t.id}>
                    <td>
                      <b>{t.brandName || "Brand"}</b>
                      <div style={{ color: "var(--text-mute)", fontSize: 12 }}>{t.brandEmail}</div>
                    </td>
                    <td style={{ color: "var(--accent-3)", fontWeight: 700, whiteSpace: "nowrap" }}>
                      ${Number(t.amount).toLocaleString()}
                    </td>
                    <td>
                      {actionable ? (
                        <input
                          className="input-sm"
                          placeholder="Payment ref"
                          value={refs[t.id] || ""}
                          onChange={(e) => setRefs((r) => ({ ...r, [t.id]: e.target.value }))}
                          style={{ maxWidth: 150 }}
                        />
                      ) : (
                        <span style={{ color: "var(--text-mute)", fontSize: 13 }}>{t.reference || "—"}</span>
                      )}
                    </td>
                    <td><span className={`status ${STATUS_CLASS[t.status] || "review"}`}>{t.status}</span></td>
                    <td>{fmtDate(t.createdAt)}</td>
                    <td>
                      {actionable ? (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button
                            className="btn btn-primary btn-sm"
                            disabled={busy === t.id}
                            onClick={() => act(t.id, "completed")}
                          >
                            {busy === t.id ? "…" : "Confirm"}
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            disabled={busy === t.id}
                            onClick={() => act(t.id, "failed")}
                          >
                            Fail
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            disabled={busy === t.id}
                            onClick={() => act(t.id, "cancelled")}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: "var(--text-mute)", fontSize: 13 }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
