"use client";

import { useEffect, useState } from "react";
import { shortAddress, explorerUrl } from "@/lib/solana";

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
 * Admin-only panel listing every $PULSE claim so payouts can be settled. The
 * treasury tokens are sent out-of-band (scripts/pay-claims.mjs); the admin then
 * marks the claim paid here WITH the on-chain tx signature (required), which
 * notifies the holder. Mirrors AdminWithdrawals.
 */
export default function AdminTokenClaims() {
  const [rows, setRows] = useState(null);
  const [symbol, setSymbol] = useState("PULSE");
  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState("");

  async function load() {
    try {
      const res = await fetch("/api/token/claim?all=1");
      const json = await res.json();
      setRows(res.ok ? json.claims || [] : []);
      if (json.symbol) setSymbol(json.symbol);
    } catch {
      setRows([]);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function mark(id, status) {
    let txSignature = "";
    if (status === "paid") {
      // eslint-disable-next-line no-alert
      txSignature = (window.prompt("Paste the treasury transaction signature for this payout:") || "").trim();
      if (!txSignature) return; // cancelled
    }
    setBusy(id);
    try {
      const res = await fetch("/api/token/claim", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, txSignature }),
      });
      if (res.ok) {
        await load();
      } else {
        const j = await res.json().catch(() => ({}));
        // eslint-disable-next-line no-alert
        if (j.error) window.alert(j.error);
      }
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
        <h3>${symbol} claims</h3>
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
          No claims yet. When a holder claims rewards, it appears here to pay from the treasury
          and mark complete.
        </p>
      ) : (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Holder</th>
                <th>Send to</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Tx</th>
                <th>Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>
                    <b>{c.holderName || "Holder"}</b>
                    <div style={{ color: "var(--text-mute)", fontSize: 12 }}>{c.holderEmail}</div>
                  </td>
                  <td>
                    <button className="addr-copy" onClick={() => copy(c.destination, c.id)} title="Click to copy">
                      <span className="addr-text">{shortAddress(c.destination, 6, 6)}</span>
                      <span className="addr-ic">{copied === c.id ? "✓ copied" : "⧉"}</span>
                    </button>
                  </td>
                  <td style={{ color: "var(--accent-3)", fontWeight: 700 }}>
                    {c.amountDisplay} {symbol}
                  </td>
                  <td><span className={`status ${STATUS_CLASS[c.status] || "review"}`}>{c.status}</span></td>
                  <td>
                    {c.txSignature ? (
                      <a href={explorerUrl(c.txSignature, "tx")} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
                        View ↗
                      </a>
                    ) : (
                      <span style={{ color: "var(--text-mute)" }}>—</span>
                    )}
                  </td>
                  <td>{fmtDate(c.createdAt)}</td>
                  <td>
                    {c.status === "pending" ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn btn-primary btn-sm" disabled={busy === c.id} onClick={() => mark(c.id, "paid")}>
                          {busy === c.id ? "…" : "Mark paid"}
                        </button>
                        <button className="btn btn-ghost btn-sm" disabled={busy === c.id} onClick={() => mark(c.id, "failed")}>
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
