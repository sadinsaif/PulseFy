"use client";

import { useState } from "react";

const REASONS = {
  creator: ["Fraud / Fake engagement", "Harassment or abusive behavior", "Copyright violation", "Misleading profile information", "Campaign abuse", "Spam", "Other"],
  brand: ["Payment issue", "Fraud / Scam", "Campaign abuse", "Misleading campaign information", "Harassment or abusive behavior", "Copyright violation", "Spam", "Other"],
};

export default function ReportModal({ reportedUserId, reportedUserName, reportedUserType, label }) {
  const [open, setOpen] = useState(false), [reason, setReason] = useState(""), [description, setDescription] = useState(""), [evidence, setEvidence] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [success, setSuccess] = useState("");
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError("");
    try { const res = await fetch("/api/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reportedUserId, reportedUserType, reason, description, evidence }) }); const d = await res.json().catch(() => ({})); if (!res.ok) setError(d.error || "Could not submit the report."); else { setSuccess(`${d.message} Reference: ${d.reportId.slice(0, 8).toUpperCase()}`); } } catch { setError("Network error. Please try again."); } finally { setBusy(false); }
  }
  return <>{<button className="btn btn-ghost" onClick={() => setOpen(true)}>{label || `Report ${reportedUserType === "brand" ? "brand" : "creator"}`}</button>}{open && <div className="modal-overlay" onClick={() => setOpen(false)}><div className="modal" onClick={(e) => e.stopPropagation()}><div className="modal-head"><h3>Report {reportedUserName || "user"}</h3><button className="modal-x" onClick={() => setOpen(false)} aria-label="Close">×</button></div>{success ? <><div className="alert ok">{success}</div><button className="btn btn-primary" onClick={() => setOpen(false)}>Done</button></> : <form className="profile-form" onSubmit={submit}><p className="modal-hint">Reports are private and reviewed by PulseFy admins. Do not include passwords or payment details.</p>{error && <div className="alert err">{error}</div>}<div className="field"><label>Reason *</label><select value={reason} onChange={(e) => setReason(e.target.value)} required><option value="">Choose a reason</option>{REASONS[reportedUserType].map((r) => <option key={r}>{r}</option>)}</select></div><div className="field"><label>Description *</label><textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} minLength={10} maxLength={3000} required placeholder="Explain what happened and when." /></div><div className="field"><label>Evidence URL <span className="muted">(optional)</span></label><input type="url" value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="https://…" /></div><button className="btn btn-primary" disabled={busy}>{busy ? "Submitting…" : "Submit report"}</button></form>}</div></div>}</>;
}
