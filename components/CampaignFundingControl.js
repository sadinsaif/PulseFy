"use client";

import { useState } from "react";

function statusFor({ budget, funded, reserved, spent }) {
  if (!funded) return "Funding pending";
  if (spent + reserved >= funded) return "Exhausted";
  if (funded < budget) return "Partially funded";
  return "Funded";
}

/** Admin-only UI; the API independently enforces the configured-admin gate. */
export default function CampaignFundingControl({ campaign }) {
  const [funding, setFunding] = useState({
    budget: Number(campaign.budget || 0),
    funded: Number(campaign.funded || 0),
    reserved: Number(campaign.reserved || 0),
    spent: Number(campaign.ledgerSpent || 0),
    available: Number(campaign.available || 0),
  });
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/admin/campaigns/${campaign.id}/funding`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, reference, note }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not record funding.");
      setFunding(data.funding);
      setAmount(""); setReference(""); setNote("");
      setMessage("Verified funding recorded.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return <div style={{ minWidth: 230 }}>
    <div className="brief">Declared: ${funding.budget.toLocaleString()}</div>
    <div className="brief">Funded: ${funding.funded.toLocaleString()} · Available: ${funding.available.toLocaleString()}</div>
    <div className="brief">Reserved: ${Number(funding.reserved || 0).toLocaleString()} · Spent: ${funding.spent.toLocaleString()} · <b>{statusFor(funding)}</b></div>
    {error && <p className="alert err" style={{ marginTop: 6 }}>{error}</p>}
    {message && <p className="brief" style={{ marginTop: 6 }}>{message}</p>}
    <form className="profile-form" style={{ marginTop: 8 }} onSubmit={submit}>
      <div className="field"><input type="number" min="1" step="1" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Verified amount ($)" /></div>
      <div className="field"><input required minLength="3" maxLength="200" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Payment / verification reference" /></div>
      <div className="field"><input maxLength="1000" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note (optional)" /></div>
      <button className="btn btn-primary btn-sm" disabled={busy}>{busy ? "Recording…" : "Record funding"}</button>
    </form>
  </div>;
}
