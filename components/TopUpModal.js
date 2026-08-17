"use client";

import { useState, useEffect } from "react";

const QUICK = [100, 500, 1000, 2500];

/**
 * Brand wallet top-up modal (mirrors the withdrawal modal's shell/classes).
 * A top-up is a REQUEST — it never claims "successful". After a successful manual
 * POST the modal shows an honest "pending confirmation" state: the balance only
 * moves once the payment is confirmed (§4). `available` is the brand's current
 * available balance in whole dollars; `presetAmount` optionally pre-fills the
 * amount (e.g. the exact shortfall from the Budget step).
 *
 * When the crypto provider is configured (GET /api/wallet/config →
 * cryptoEnabled), a second method — "Pay with crypto" — is offered. It hands off
 * to our provider's hosted crypto checkout; the balance is still credited only
 * later, when the signed webhook confirms the on-chain payment. When crypto is
 * NOT configured, this modal behaves exactly as the manual-only flow always has.
 */
export default function TopUpModal({ available = 0, presetAmount = 0, onClose, onSuccess }) {
  const [amount, setAmount] = useState(presetAmount > 0 ? String(presetAmount) : "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [cryptoEnabled, setCryptoEnabled] = useState(false);
  const [method, setMethod] = useState("manual"); // "manual" | "crypto"

  // Ask the server whether the crypto option should be shown. Fail closed: any
  // error or a false flag leaves the manual-only flow in place.
  useEffect(() => {
    let alive = true;
    fetch("/api/wallet/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d) setCryptoEnabled(!!d.cryptoEnabled);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const amt = Math.floor(Number(amount) || 0);
  const nextAvailable = available + (amt > 0 ? amt : 0);
  const isCrypto = cryptoEnabled && method === "crypto";

  async function submit() {
    setErr("");
    if (!Number.isFinite(amt) || amt <= 0) {
      setErr("Enter an amount greater than $0.");
      return;
    }
    setSaving(true);
    try {
      if (isCrypto) {
        // Hand off to our provider's hosted crypto checkout. Keep `saving` true
        // through the redirect so the button stays disabled while the browser
        // navigates.
        const res = await fetch("/api/wallet/topups/crypto", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: amt }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.hosted_url) {
          setSaving(false);
          setErr(data.error || "Could not start the crypto payment.");
          return;
        }
        window.location.href = data.hosted_url;
        return;
      }

      // Manual request (unchanged): creates a pending top-up an admin confirms.
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

              {cryptoEnabled && (
                <>
                  <label className="wd-label" style={{ marginTop: 4 }}>Payment method</label>
                  <div className="toggle-group">
                    <button
                      type="button"
                      className={`toggle-btn${method === "manual" ? " active" : ""}`}
                      onClick={() => setMethod("manual")}
                      aria-pressed={method === "manual"}
                    >
                      <div>
                        <b>Manual request</b>
                        <span>Bank transfer or other — our team confirms it</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      className={`toggle-btn${method === "crypto" ? " active" : ""}`}
                      onClick={() => setMethod("crypto")}
                      aria-pressed={method === "crypto"}
                    >
                      <div>
                        <b>Pay with crypto</b>
                        <span>Connect your wallet — confirmed automatically on-chain</span>
                      </div>
                    </button>
                  </div>
                </>
              )}

              <div className="wd-breakdown">
                <div><span>Current balance</span><span>${available.toLocaleString()}</span></div>
                <div><span>Top-up</span><span>+${amt > 0 ? amt.toLocaleString() : "0"}</span></div>
                <div className="wd-receive">
                  <b>Balance after confirmation</b>
                  <b>${nextAvailable.toLocaleString()}</b>
                </div>
              </div>

              <p className="wd-minmax" style={{ marginTop: 12 }}>
                {isCrypto
                  ? "You'll finish paying on our secure crypto checkout. Your balance updates only after the payment is confirmed on-chain — never before."
                  : "Payments are confirmed manually. Your balance updates once the payment clears — you'll never see “successful” before it's confirmed."}
              </p>

              <button
                className="btn btn-primary"
                style={{ width: "100%", marginTop: 14 }}
                disabled={saving}
                onClick={submit}
              >
                {isCrypto
                  ? saving
                    ? "Starting…"
                    : "Pay with crypto"
                  : saving
                    ? "Requesting…"
                    : "Continue"}
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
