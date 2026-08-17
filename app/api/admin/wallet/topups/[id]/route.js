export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { notifyUser } from "@/lib/notify";
import { applyTopupTransition } from "@/lib/topup-transition";

// The transitions an admin may apply to a pending/processing top-up. Only
// `completed` credits the brand's Available balance (derived), and it requires a
// payment reference — the honest "money confirmed" step (§4/§5). The crypto
// webhook drives the SAME transition via the shared helper below.
const ALLOWED = ["processing", "completed", "failed", "cancelled"];

/**
 * PATCH /api/admin/wallet/topups/[id]
 * Body: { status, reference?, note? }. Admin-only. A top-up is only credited to
 * the wallet when it becomes `completed`; balances are derived, so this route
 * writes no balance column — it just advances the lifecycle safely under a lock
 * (shared with the crypto webhook via applyTopupTransition).
 */
export async function PATCH(req, { params }) {
  const session = await auth();
  if (!session?.user?.id || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { status, reference, note } = body || {};
  if (!ALLOWED.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  // Confirming money requires a payment reference so the record is auditable.
  const ref = typeof reference === "string" ? reference.trim() : "";
  if (status === "completed" && ref.length < 3) {
    return NextResponse.json(
      { error: "A payment reference is required to confirm a top-up." },
      { status: 400 }
    );
  }

  let result;
  try {
    result = await applyTopupTransition(
      { id: params.id },
      { status, reference: ref, note }
    );
  } catch (error) {
    if (error.status) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  if (result.changed) {
    const amt = Number(result.current.amount).toLocaleString();
    let message = null;
    if (status === "completed") {
      message = `Your $${amt} wallet top-up has been confirmed and added to your balance ✅`;
    } else if (status === "failed") {
      message = `Your $${amt} wallet top-up could not be confirmed.`;
    } else if (status === "cancelled") {
      message = `Your $${amt} wallet top-up was cancelled.`;
    }
    if (message) {
      await notifyUser(result.current.brandId, {
        type: "topup",
        message,
        link: "/dashboard/payouts",
      });
    }
  }

  return NextResponse.json({ ok: true, status });
}
