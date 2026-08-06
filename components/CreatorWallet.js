"use client";

import { useEffect, useState } from "react";
import WithdrawModal from "@/components/WithdrawModal";

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
 * Creator wallet: shows available balance, a Withdraw button (opens the
 * GIMI-style modal), and the creator's withdrawal history. All real data
 * from /api/withdrawals.
 */
export default function CreatorWallet() {
  const [data, setData] = useState(null);
  const [showModal, setShowModal] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/withdrawals");
      const json = await res.json();
      setData(res.ok ? json : { balance: { earned: 0, withdrawn: 0, available: 0 }, withdrawals: [] });
    } catch {
      setData({ balance: { earned: 0, withdrawn: 0, available: 0 }, withdrawals: [] });
    }
  }

  useEffect(() => {
    load();
  }, []);

  const bal = data?.balance || { earned: 0, withdrawn: 0, available: 0 };
  const rows = data?.withdrawals || [];

  return (
    <>
      {/* Balance hero */}
      <section className="wallet-hero">
        <div className="wallet-bal">
          <span className="wallet-lbl">Available balance</span>
          <span className="wallet-val">${bal.available.toFixed(2)}</span>
          <span className="wallet-sub">
            ${bal.earned.toFixed(2)} earned · ${bal.withdrawn.toFixed(2)} withdrawn
          </span>
        </div>
        <button
          className="btn btn-primary"
          disabled={bal.available < 5}
          onClick={() => setShowModal(true)}
          title={bal.available < 5 ? "You need at least $5 to withdraw" : "Withdraw your balance"}
        >
          ⭳ Withdraw
        </button>
      </section>

      {bal.available < 5 && (
        <p className="brief" style={{ marginTop: 8 }}>
          You need at least <b>$5</b> available to withdraw. Keep submitting clips to
          earn more.
        </p>
      )}

      {/* Withdrawal history */}
      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel-head">
          <h3>Withdrawal history</h3>
        </div>
        {data === null ? (
          <p className="brief" style={{ marginTop: 10 }}>Loading…</p>
        ) : rows.length === 0 ? (
          <p className="brief" style={{ marginTop: 10 }}>
            No withdrawals yet. When you cash out, your requests show up here.
          </p>
        ) : (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>Method</th>
                  <th>Destination</th>
                  <th>Amount</th>
                  <th>Fee</th>
                  <th>You received</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((w) => (
                  <tr key={w.id}>
                    <td>
                      <b>{METHOD_LABEL[w.method] || w.method}</b>
                      {w.method === "stablecoin" && w.coin && (
                        <span style={{ color: "var(--text-mute)", fontSize: 12 }}>
                          {" "}· {w.coin.toUpperCase()} / {w.network}
                        </span>
                      )}
                    </td>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                      {w.destination.length > 18
                        ? `${w.destination.slice(0, 8)}…${w.destination.slice(-6)}`
                        : w.destination}
                    </td>
                    <td>${(w.amount / 100).toFixed(2)}</td>
                    <td style={{ color: "var(--text-mute)" }}>-${(w.fee / 100).toFixed(2)}</td>
                    <td style={{ color: "var(--accent-3)", fontWeight: 700 }}>
                      ${(w.net / 100).toFixed(2)}
                    </td>
                    <td>
                      <span className={`status ${STATUS_CLASS[w.status] || "review"}`}>{w.status}</span>
                    </td>
                    <td>{fmtDate(w.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showModal && (
        <WithdrawModal
          available={bal.available}
          onClose={() => setShowModal(false)}
          onSuccess={() => load()}
        />
      )}
    </>
  );
}
