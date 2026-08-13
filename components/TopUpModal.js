"use client";

import { useState } from "react";

const QUICK = [100, 500, 1000, 2500];

/**
 * Brand wallet top-up modal (mirrors the withdrawal modal's shell/classes).
 * A top-up is a REQUEST — it never claims "successful". After a successful POST
 * the modal shows an honest "pending confirmation" state: the balance only moves
 * once an admin confirms the payment (§4). `available` is the brand's current
 * available balance in whole dollars; `presetAmount` optionally pre-fills the
 * amount (e.g. the exact shortfall from the Budget step).
 */
export default function TopUpModal({ available = 0, presetAmount = 0, onClose, onSuccess }) {
  const [amount, setAmount] = useState(presetAmount > 0 ? String(presetAmount) : "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  const amt = Math.floor(Number(amount) || 0);
  const nextAvailable = available + (amt > 0 ? amt : 0);

  async function submit() {
    setErr("");
    if (!Number.isFinite(amt) || amt <= 0) {
      setErr("Enter an amount greater than $0.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/wallet/topups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt }),
      });
      const data = await res.json().catch(() => ({}));
      setSaving(false);
      if (!res.ok) {
        setErr(data.error || "Could not request the top-up.");
        return;
      }
      setDone(true);
      onSuccess?.();
    } catch {
      setSaving(false);
      setErr("Network error. Please try again.");
    }
  }

  return (
    <div className="wd-overlay" onClick={onClose}>
      <div className="wd-modal" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <div className="wd-done">
            <div className="wd-done-ic">⏳</div>
            <h3>Pending — we&apos;ll confirm your payment shortly</h3>
            <p>
              Your <b>${amt.toLocaleString()}</b> top-up has been requested. It will be
              added to your available balance once the payment is confirmed. You can
              track it in your transactions.
            </p>
            <button className="btn btn-primary" style={{ width: "100%", marginTop: 8 }} onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="wd-head">
              <div className="wd-head-titles">
                <h3>Top up your wallet</h3>
                <p>Add funds to launch and reserve campaign budgets</p>
              </div>
              <button className="wd-close" onClick={onClose} aria-label="Close">✕</button>
            </div>

            <div className="wd-balance">
              Current Balance: <b>${available.toLocaleString()}</b>
            </div>

            {err && <div className="alert err" style={{ margin: "0 20px" }}>{err}</div>}

            <div className="wd-body">
              <label className="wd-label">Top-up Amount</label>
              <div className="wd-amount">
                <span className="wd-currency">$</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={amount}
                  placeholder="0"
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="wd-quick">
                {QUICK.map((q) => (
                  <button key={q} type="button" onClick={() => setAmount(String(q))}>
                    ${q.toLocaleString()}
                  </button>
                ))}
              </div>

              <div className="wd-breakdown">
                <div><span>Current balance</span><span>${available.toLocaleString()}</span></div>
                <div><span>Top-up</span><span>+${amt > 0 ? amt.toLocaleString() : "0"}</span></div>
                <div className="wd-receive">
                  <b>Balance after confirmation</b>
                  <b>${nextAvailable.toLocaleString()}</b>
                </div>
              </div>

              <p className="wd-minmax" style={{ marginTop: 12 }}>
                Payments are confirmed manually. Your balance updates once the payment
                clears — you&apos;ll never see &quot;successful&quot; before it&apos;s confirmed.
              </p>

              <button
                className="btn btn-primary"
                style={{ width: "100%", marginTop: 14 }}
                disabled={saving}
                onClick={submit}
              >
                {saving ? "Requesting…" : "Continue"}
              </button>
              <button
                className="btn btn-ghost"
                style={{ width: "100%", marginTop: 8 }}
                onClick={onClose}
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
