"use client";
import { useState } from "react";

export default function TrustReviewForm({ campaignId, revieweeId, label = "Leave a review", onSubmitted }) {
  const [open, setOpen] = useState(false), [rating, setRating] = useState(5), [comment, setComment] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/trust-reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaignId, revieweeId, rating, comment }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMessage(d.error || "Could not submit review."); return; }
      setMessage("Review submitted. Thank you.");
      setComment("");
      setOpen(false);
      onSubmitted?.();
    } catch {
      setMessage("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return <div style={{ marginTop: 10 }}><button className="btn btn-ghost btn-sm" onClick={() => setOpen(!open)} disabled={busy}>{label}</button>{open && <form className="profile-form" onSubmit={submit} style={{ marginTop: 10 }}><div className="field"><label>Rating</label><select value={rating} onChange={(e) => setRating(Number(e.target.value))} disabled={busy}>{[5,4,3,2,1].map((n) => <option key={n} value={n}>{n} stars</option>)}</select></div><div className="field"><label>Review</label><textarea required minLength={10} maxLength={2000} rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Share your completed-campaign experience…" disabled={busy} /></div>{message && <p className="brief">{message}</p>}<button className="btn btn-primary btn-sm" disabled={busy}>{busy ? "Submitting…" : "Submit review"}</button></form>}</div>;
}
