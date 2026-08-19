"use client";

import { useState } from "react";

const FEE_RATE = 0.05;
const QUICK = [15, 20, 30, 50];

/**
 * GIMI-style multi-step withdrawal modal.
 * Steps: method → (stablecoin coin → network) → details (amount + wallet).
 * `available` is the creator's available balance in dollars.
 * `defaultDestination` is the creator's auto-provisioned embedded wallet (0x),
 * used to prefill the stablecoin address (still editable).
 * Calls onSuccess() after a successful POST and onClose() to dismiss.
 */
export default function WithdrawModal({ available = 0, defaultDestination = "", onClose, onSuccess }) {
  const [step, setStep] = useState("method"); // method | coin | network | details
  const [method, setMethod] = useState(null); // stablecoin | bank
  const [coin, setCoin] = useState("usdc");
  const [network, setNetwork] = useState("base");
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  const amt = parseFloat(amount) || 0;
  const fee = amt * FEE_RATE;
  const receive = amt - fee;

  function chooseMethod(m) {
    setMethod(m);
    setErr("");
    // Destination is method-specific: a 0x wallet for stablecoin, a payout email
    // for bank/PayPal. Reset it on every method switch so a prefilled wallet can
    // never leak into the email field (and vice-versa). For stablecoin, seed the
    // auto-provisioned embedded wallet as a starting point — still fully editable.
    setDestination(m === "stablecoin" && defaultDestination ? defaultDestination : "");
    setStep(m === "stablecoin" ? "coin" : "details");
  }

  async function submit() {
    setErr("");
    if (amt < 5) {
      setErr("Minimum withdrawal is $5.");
      return;
    }
    if (amt > available) {
      setErr(`You only have $${available.toFixed(2)} available.`);
      return;
    }
    if (!destination.trim()) {
      setErr(method === "stablecoin" ? "Enter your wallet address." : "Enter your payout email.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, amount: amt, coin, network, destination: destination.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      setSaving(false);
      if (!res.ok) {
        setErr(data.error || "Could not process the withdrawal.");
        return;
      }
      setDone(true);
      onSuccess?.();
    } catch {
      setSaving(false);
      setErr("Network error. Please try again.");
    }
  }

  function back() {
    setErr("");
    if (step === "details") setStep(method === "stablecoin" ? "network" : "method");
    else if (step === "network") setStep("coin");
    else if (step === "coin") setStep("method");
  }

  return (
    <div className="wd-overlay" onClick={onClose}>
      <div className="wd-modal" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <div className="wd-done">
            <div className="wd-done-ic">✅</div>
            <h3>Withdrawal requested</h3>
            <p>
              ${receive.toFixed(2)} is on its way{method === "stablecoin" ? ` as ${coin.toUpperCase()} on ${network}` : " via bank / PayPal"}.
              You&apos;ll see it in your withdrawal history.
            </p>
            <button className="btn btn-primary" style={{ width: "100%", marginTop: 8 }} onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="wd-head">
              {step !== "method" && (
                <button className="wd-back" onClick={back} aria-label="Back">←</button>
              )}
              <div className="wd-head-titles">
                <h3>
                  {step === "method" && "Select Withdrawal Method"}
                  {step === "coin" && "Select Stablecoin"}
                  {step === "network" && "Select Network"}
                  {step === "details" && "Withdrawal Details"}
                </h3>
                <p>
                  {step === "method" && "Choose how you want to receive your funds"}
                  {step === "coin" && "USDC"}
                  {step === "network" && "Select the network for your withdrawal"}
                  {step === "details" && "Enter the amount and destination"}
                </p>
              </div>
              <button className="wd-close" onClick={onClose} aria-label="Close">✕</button>
            </div>

            <div className="wd-balance">
              Available Balance: <b>${available.toFixed(2)}</b>
            </div>

            {err && <div className="alert err" style={{ margin: "0 20px" }}>{err}</div>}

            {/* STEP: method */}
            {step === "method" && (
              <div className="wd-body">
                <button className="wd-option" onClick={() => chooseMethod("bank")}>
                  <div className="wd-opt-ic" style={{ background: "rgba(255,180,58,.15)" }}>🏦</div>
                  <div className="wd-opt-txt">
                    <b>Bank Transfer &amp; PayPal</b>
                    <span>2–3 business days</span>
                  </div>
                  <span className="wd-arrow">›</span>
                </button>
                <button className="wd-option" onClick={() => chooseMethod("stablecoin")}>
                  <div className="wd-opt-ic" style={{ background: "rgba(52,211,153,.15)" }}>🪙</div>
                  <div className="wd-opt-txt">
                    <b>Stablecoin <span className="wd-tag">Instant</span></b>
                    <span>USDC · Transfer in minutes</span>
                  </div>
                  <span className="wd-arrow">›</span>
                </button>
              </div>
            )}

            {/* STEP: coin */}
            {step === "coin" && (
              <div className="wd-body">
                <button
                  className={`wd-option ${coin === "usdc" ? "active" : ""}`}
                  onClick={() => setCoin("usdc")}
                >
                  <div className="wd-opt-ic" style={{ background: "rgba(38,110,255,.15)" }}>💲</div>
                  <div className="wd-opt-txt">
                    <b>USDC</b>
                    <span>Available on Base</span>
                  </div>
                  {coin === "usdc" && <span className="wd-check">✓</span>}
                </button>
                <button className="btn btn-primary" style={{ width: "100%", marginTop: 6 }} onClick={() => setStep("network")}>
                  Next →
                </button>
              </div>
            )}

            {/* STEP: network */}
            {step === "network" && (
              <div className="wd-body">
                <button
                  className={`wd-option ${network === "base" ? "active" : ""}`}
                  onClick={() => setNetwork("base")}
                >
                  <div className="wd-opt-ic" style={{ background: "rgba(38,110,255,.15)" }}>🔵</div>
                  <div className="wd-opt-txt">
                    <b>Base <span className="wd-tag">L2 Network</span></b>
                    <span>Low fees</span>
                  </div>
                  {network === "base" && <span className="wd-check">✓</span>}
                </button>
                <div className="wd-option disabled">
                  <div className="wd-opt-ic" style={{ background: "rgba(255,255,255,.06)" }}>⬨</div>
                  <div className="wd-opt-txt">
                    <b>Ethereum <span className="wd-tag muted">Unavailable</span></b>
                    <span>Temporarily unavailable</span>
                  </div>
                </div>
                <p className="wd-soon">✨ More networks coming soon (Solana)</p>
                <button className="btn btn-primary" style={{ width: "100%", marginTop: 6 }} onClick={() => setStep("details")}>
                  Next →
                </button>
              </div>
            )}

            {/* STEP: details */}
            {step === "details" && (
              <div className="wd-body">
                <label className="wd-label">Withdrawal Amount</label>
                <div className="wd-amount">
                  <span className="wd-currency">$</span>
                  <input
                    type="number"
                    min="5"
                    max={Math.min(100, available)}
                    value={amount}
                    placeholder="0"
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  <button
                    type="button"
                    className="wd-max"
                    onClick={() => setAmount(String(Math.min(100, Math.floor(available))))}
                  >
                    Max
                  </button>
                </div>
                <div className="wd-quick">
                  {QUICK.map((q) => (
                    <button key={q} type="button" onClick={() => setAmount(String(q))} disabled={q > available}>
                      ${q}
                    </button>
                  ))}
                </div>
                <p className="wd-minmax">Min: $5 · Max: ${Math.min(100, Math.floor(available)) || 0}</p>

                <div className="wd-breakdown">
                  <div><span>Requested</span><span>${amt.toFixed(2)}</span></div>
                  <div><span>Processing fee (5%)</span><span>-${fee.toFixed(2)}</span></div>
                  <div className="wd-receive">
                    <b>You receive</b>
                    <b>${receive > 0 ? receive.toFixed(2) : "0.00"} {method === "stablecoin" ? coin.toUpperCase() : "USD"}</b>
                  </div>
                </div>

                <label className="wd-label" style={{ marginTop: 14 }}>
                  {method === "stablecoin" ? "Wallet Address" : "Payout Email (Bank / PayPal)"}
                </label>
                <input
                  className="wd-dest"
                  value={destination}
                  placeholder={method === "stablecoin" ? "0x…" : "you@example.com"}
                  onChange={(e) => setDestination(e.target.value)}
                />

                <button
                  className="btn btn-primary"
                  style={{ width: "100%", marginTop: 14 }}
                  disabled={saving}
                  onClick={submit}
                >
                  {saving ? "Processing…" : "Confirm withdrawal"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
