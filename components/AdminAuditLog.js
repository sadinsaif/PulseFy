"use client";

import { useEffect, useState } from "react";

export default function AdminAuditLog() {
  const [events, setEvents] = useState([]), [error, setError] = useState("");
  useEffect(() => { (async () => { const r = await fetch("/api/admin/moderation"); const d = await r.json().catch(() => ({})); if (r.ok) setEvents(d.events || []); else setError(d.error || "Could not load audit log."); })(); }, []);
  return <section className="panel" style={{ marginTop: 18 }}><div className="panel-head"><h3>Admin audit log</h3></div>{error && <div className="alert err">{error}</div>}{events.length ? <div className="table-wrap"><table><thead><tr><th>Action</th><th>Admin</th><th>Reason / note</th><th>Target</th><th>Date</th></tr></thead><tbody>{events.map((e) => <tr key={e.id}><td>{e.action}</td><td>{e.adminName}</td><td>{e.reason || e.note || "—"}</td><td>{e.targetUserId ? e.targetUserId.slice(0, 8).toUpperCase() : "—"}</td><td>{new Date(e.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div> : <p className="brief">No audit events yet.</p>}</section>;
}
