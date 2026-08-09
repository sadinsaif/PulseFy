"use client";

import { useEffect, useState } from "react";

const STATUS = { active: "Active", warned: "Warned", suspended: "Suspended", banned: "Banned" };

export default function ModerationControls({ user, relatedReportId = "", compact = false }) {
  const [open, setOpen] = useState(false), [events, setEvents] = useState([]), [action, setAction] = useState("warning");
  const [reason, setReason] = useState(""), [note, setNote] = useState(""), [durationHours, setDurationHours] = useState("168"), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function load() { const r = await fetch(`/api/admin/moderation?userId=${encodeURIComponent(user.id)}`); const d = await r.json().catch(() => ({})); if (r.ok) setEvents(d.events || []); else setError(d.error || "Could not load moderation history."); }
  useEffect(() => { if (open) load(); }, [open]);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError("");
    const r = await fetch("/api/admin/moderation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetUserId: user.id, action, reason, note, durationHours: action === "suspension" ? Number(durationHours) : undefined, relatedReportId }) });
    const d = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) { setError(d.error || "Could not save moderation action."); return; }
    setReason(""); setNote(""); await load();
  }
  const current = user.moderationStatus || "active";
  return <><button className={`btn ${compact ? "btn-ghost" : "btn-primary"}`} onClick={() => setOpen(true)}>Moderate</button>{open && <div className="modal-overlay" onClick={() => setOpen(false)}><div className="modal report-detail" onClick={(e) => e.stopPropagation()}><div className="modal-head"><h3>Moderate {user.name || user.company || "user"}</h3><button className="modal-x" onClick={() => setOpen(false)}>×</button></div><p>Current status: <span className={`status ${current === "banned" ? "ended" : current === "suspended" ? "review" : "live"}`}>{STATUS[current] || "Active"}</span></p>{user.suspendedUntil && current === "suspended" && <p className="brief">Suspended until {new Date(user.suspendedUntil).toLocaleString()}</p>}{error && <div className="alert err">{error}</div>}<form className="profile-form" onSubmit={submit}><div className="field"><label>Action *</label><select value={action} onChange={(e) => setAction(e.target.value)}><option value="warning">Warn user</option><option value="suspension">Suspend user</option><option value="ban">Ban user</option>{current === "banned" && <option value="unban">Unban user</option>}<option value="moderation_note">Add moderation note</option></select></div>{action === "suspension" && <div className="field"><label>Duration *</label><select value={durationHours} onChange={(e) => setDurationHours(e.target.value)}><option value="24">24 hours</option><option value="72">3 days</option><option value="168">7 days</option><option value="720">30 days</option><option value="8760">1 year</option></select></div>}<div className="field"><label>Reason *</label><input value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} required /></div><div className="field"><label>Internal note *</label><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} minLength={3} required /></div>{["ban", "suspension"].includes(action) && <p className="alert err">Confirm: this will restrict the user&apos;s protected platform access. Reason: {reason || "(required)"}</p>}<button className={action === "ban" ? "btn btn-danger" : "btn btn-primary"} disabled={busy}>{busy ? "Saving…" : action === "ban" ? "Confirm ban" : "Save action"}</button></form><h4>Moderation history</h4>{events.length ? events.map((e) => <p className="brief" key={e.id}><b>{e.action}</b> · {e.reason || e.note} · {e.adminName} · {new Date(e.createdAt).toLocaleString()}{e.expiresAt ? ` · expires ${new Date(e.expiresAt).toLocaleString()}` : ""}</p>) : <p className="brief">No moderation history.</p>}</div></div>}</>;
}
