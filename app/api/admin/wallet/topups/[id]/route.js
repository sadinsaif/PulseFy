export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { brandTopups } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isAdminEmail } from "@/lib/admin";
import { notifyUser } from "@/lib/notify";

// The transitions an admin may apply to a pending/processing top-up. Only
// `completed` credits the brand's Available balance (derived), and it requires a
// payment reference — the honest "money confirmed" step (§4/§5). A real Stripe
// webhook could later drive the same transition with zero UI change.
const ALLOWED = ["processing", "completed", "failed", "cancelled"];

/**
 * PATCH /api/admin/wallet/topups/[id]
 * Body: { status, reference?, note? }. Admin-only. A top-up is only credited to
 * the wallet when it becomes `completed`; balances are derived, so this route
 * writes no balance column — it just advances the lifecycle safely under a lock.
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
    result = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(brandTopups)
        .where(eq(brandTopups.id, params.id))
        .for("update");
      if (!current) {
        const error = new Error("Top-up not found");
        error.status = 404;
        throw error;
      }

      if (current.status === status) return { current, changed: false };

      // Terminal states are final — never rewrite a completed/failed/cancelled
      // financial record (§17).
      if (["completed", "failed", "cancelled"].includes(current.status)) {
        const error = new Error(
          `A ${current.status} top-up is final and cannot be changed.`
        );
        error.status = 409;
        throw error;
      }

      await tx
        .update(brandTopups)
        .set({
          status,
          reference: status === "completed" ? ref : current.reference,
          note: typeof note === "string" && note.trim() ? note.trim() : current.note,
          updatedAt: new Date(),
        })
        .where(eq(brandTopups.id, current.id));

      return { current, changed: true };
    });
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
