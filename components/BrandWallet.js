"use client";

import { useCallback, useEffect, useState } from "react";
import TopUpModal from "@/components/TopUpModal";

// Transaction status → the existing status badge classes (§21: reuse, no new
// colors). completed = green (live), pending/processing = amber (review),
// failed/cancelled = red (ended).
const STATUS_CLASS = {
  completed: "live",
  pending: "review",
  processing: "review",
  failed: "ended",
  cancelled: "ended",
};

// Filters only for transaction types that actually exist (§15). No "Refunds"
// filter — there is no refund flow.
const FILTERS = [
  { key: "all", label: "All" },
  { key: "topups", label: "Top Ups" },
  { key: "campaigns", label: "Campaigns" },
  { key: "payouts", label: "Payouts" },
];

function fmtDate(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

function money(n) {
  return `$${Math.abs(Number(n || 0)).toLocaleString()}`;
}

/**
 * Brand wallet: Available / Reserved / Total balances (all derived server-side),
 * a single "+ Top Up" button, and the brand's real transaction history with
 * type filters. All amounts are whole dollars, USD. Empty history → "No
 * transactions yet." (§15/§20).
 */
export default function BrandWallet() {
  const [wallet, setWallet] = useState(null); // { available, reserved, total }
  const [txns, setTxns] = useState(null);
  const [filter, setFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);

  const loadWallet = useCallback(async () => {
    try {
      const res = await fetch("/api/wallet");
      const json = await res.json();
      setWallet(res.ok ? json.wallet : { available: 0, reserved: 0, total: 0 });
    } catch {
      setWallet({ available: 0, reserved: 0, total: 0 });
    }
  }, []);

  const loadTxns = useCallback(async (type) => {
    setTxns(null);
    try {
      const res = await fetch(`/api/wallet/transactions?type=${type}`);
      const json = await res.json();
      setTxns(res.ok ? json.transactions || [] : []);
    } catch {
      setTxns([]);
    }
  }, []);

  useEffect(() => {
    loadWallet();
  }, [loadWallet]);

  useEffect(() => {
    loadTxns(filter);
  }, [filter, loadTxns]);

  const w = wallet || { available: 0, reserved: 0, total: 0 };
  const rows = txns || [];

  return (
    <>
      {/* Balance hero — Available / Reserved / Total */}
      <section className="wallet-hero">
        <div className="wallet-bal">
          <span className="wallet-lbl">Available balance</span>
          <span className="wallet-val">${Number(w.available).toLocaleString()}</span>
          <span className="wallet-sub">
            ${Number(w.reserved).toLocaleString()} reserved · ${Number(w.total).toLocaleString()} total
          </span>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + Top Up
        </button>
      </section>

      {/* Three-up balance cards for clarity on wider screens */}
      <div className="wallet-cards">
        <div className="wallet-card">
          <span className="wallet-card-lbl">Available</span>
          <span className="wallet-card-val">${Number(w.available).toLocaleString()}</span>
          <span className="wallet-card-sub">Ready to fund campaigns</span>
        </div>
        <div className="wallet-card">
          <span className="wallet-card-lbl">Reserved</span>
          <span className="wallet-card-val">${Number(w.reserved).toLocaleString()}</span>
          <span className="wallet-card-sub">Held by live campaigns</span>
        </div>
        <div className="wallet-card">
          <span className="wallet-card-lbl">Total</span>
          <span className="wallet-card-val">${Number(w.total).toLocaleString()}</span>
          <span className="wallet-card-sub">Available + reserved</span>
        </div>
      </div>

      {/* Subtle low-balance note only here (§16) — no app-wide warnings. */}
      {wallet !== null && Number(w.available) === 0 && (
        <p className="brief" style={{ marginTop: 8 }}>
          Your available balance is <b>$0</b>. Top up to fund and launch new campaigns.
        </p>
      )}

      {/* Recent transactions */}
      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel-head">
          <h3>Recent transactions</h3>
        </div>

        <div className="review-filters" style={{ marginTop: 12 }}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`platform-chip ${filter === f.key ? "active" : ""}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {txns === null ? (
          <p className="brief" style={{ marginTop: 10 }}>Loading…</p>
        ) : rows.length === 0 ? (
          <p className="brief" style={{ marginTop: 10 }}>No transactions yet.</p>
        ) : (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Campaign</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const positive = Number(t.amount) >= 0;
                  return (
                    <tr key={t.id}>
                      <td>{fmtDate(t.date)}</td>
                      <td><b>{t.type}</b></td>
                      <td>{t.campaign || "—"}</td>
                      <td
                        style={{
                          color: positive ? "var(--accent-3)" : "var(--text-mute)",
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {positive ? "+" : "−"}{money(t.amount)}
                      </td>
                      <td>
                        <span className={`status ${STATUS_CLASS[t.status] || "review"}`}>
                          {t.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showModal && (
        <TopUpModal
          available={Number(w.available)}
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            // A pending top-up doesn't change balances yet, but it does appear in
            // history — refresh both so the new pending row shows immediately.
            loadWallet();
            loadTxns(filter);
          }}
        />
      )}
    </>
  );
}
