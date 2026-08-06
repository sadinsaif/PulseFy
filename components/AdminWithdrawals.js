"use client";

import { useEffect, useState } from "react";

const METHOD_LABEL = { stablecoin: "Stablecoin", bank: "Bank / PayPal" };
const STATUS_CLASS = { pending: "review", paid: "live", failed: "ended" };

function fmtDate(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

/**
 * Admin-only panel listing every withdrawal request so payouts can be actioned.
 * Admin sends the money manually (crypto / bank), then marks the row paid.
 */
export default function AdminWithdrawals() {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState("");

  async function load() {
    try {
      const res = await fetch("/api/withdrawals?all=1");
      const json = await res.json();
      setRows(res.ok ? json.withdrawals || [] : []);
    } catch {
      setRows([]);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function mark(id, status) {
    setBusy(id);
    try {
      const res = await fetch("/api/withdrawals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (res.ok) await load();
    } finally {
      setBusy("");
    }
  }

  function copy(text, id) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(""), 1500);
    });
  }

  const pending = (rows || []).filter((r) => r.status === "pending");

  return (
    <section className="panel" style={{ marginTop: 18 }}>
      <div className="panel-head">
        <h3>Withdrawal requests</h3>
        {pending.length > 0 && (
          <span className="tag-pill" style={{ background: "rgba(255,180,58,.15)", color: "var(--accent)" }}>
            {pending.length} pending
          </span>
        )}
      </div>

      {rows === null ? (
        <p className="brief" style={{ marginTop: 10 }}>Loading…</p>
      ) : rows.length === 0 ? (
        <p className="brief" style={{ marginTop: 10 }}>
          No withdrawal requests yet. When a creator cashes out, it appears here for
          you to pay and mark complete.
        </p>
      ) : (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Creator</th>
                <th>Method</th>
                <th>Send to</th>
                <th>Pay this</th>
                <th>Status</th>
                <th>Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.id}>
                  <td>
                    <b>{w.creatorName || "Creator"}</b>
                    <div style={{ color: "var(--text-mute)", fontSize: 12 }}>{w.creatorEmail}</div>
                  </td>
                  <td>
                    <b>{METHOD_LABEL[w.method] || w.method}</b>
                    {w.method === "stablecoin" && w.coin && (
                      <div style={{ color: "var(--text-mute)", fontSize: 12 }}>
                        {w.coin.toUpperCase()} / {w.network}
                      </div>
                    )}
                  </td>
                  <td>
                    <button
                      className="addr-copy"
                      onClick={() => copy(w.destination, w.id)}
                      title="Click to copy"
                    >
                      <span className="addr-text">
                        {w.destination.length > 20
                          ? `${w.destination.slice(0, 10)}…${w.destination.slice(-6)}`
                          : w.destination}
                      </span>
                      <span className="addr-ic">{copied === w.id ? "✓ copied" : "⧉"}</span>
                    </button>
                  </td>
                  <td style={{ color: "var(--accent-3)", fontWeight: 700 }}>
                    ${(w.net / 100).toFixed(2)}
                    <div style={{ color: "var(--text-mute)", fontSize: 11, fontWeight: 400 }}>
                      req ${(w.amount / 100).toFixed(2)} · fee ${(w.fee / 100).toFixed(2)}
                    </div>
                  </td>
                  <td><span className={`status ${STATUS_CLASS[w.status] || "review"}`}>{w.status}</span></td>
                  <td>{fmtDate(w.createdAt)}</td>
                  <td>
                    {w.status === "pending" ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={busy === w.id}
                          onClick={() => mark(w.id, "paid")}
                        >
                          {busy === w.id ? "…" : "Mark paid"}
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={busy === w.id}
                          onClick={() => mark(w.id, "failed")}
                        >
                          Fail
                        </button>
                      </div>
                    ) : (
                      <span style={{ color: "var(--text-mute)", fontSize: 13 }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
