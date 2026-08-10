"use client";

import { useState } from "react";

/** Admin-only control; the API independently rechecks the configured admin. */
export default function TrustAdminControls({ user }) {
  const [verified, setVerified] = useState(Boolean(user.isVerified));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function toggle() {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/admin/trust", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetUserId: user.id, action: verified ? "unverify" : "verify" }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error || "Could not update verification."); else setVerified(Boolean(data.isVerified));
    } catch { setError("Network error."); }
    setBusy(false);
  }
  return <span><button className="btn btn-ghost btn-sm" disabled={busy} onClick={toggle}>{busy ? "Saving…" : verified ? "Unverify" : "Verify"}</button>{error && <span className="brief" style={{ color: "var(--danger)" }}>{error}</span>}</span>;
}
