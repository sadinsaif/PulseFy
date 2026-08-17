export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { campaigns, brandWalletLedger, moderationEvents } from "@/db/schema";
import { isAdminEmail } from "@/lib/admin";

function failure(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/**
 * DELETE /api/admin/campaigns/[id] — admin "delete any campaign".
 *
 * Admin-only. This is a SOFT delete (archive): it stamps campaigns.deleted_at,
 * which hides the campaign from every listing / browse / detail surface, and in
 * the SAME transaction runs the exact end→release money path so any reserved
 * (unspent) budget returns to the brand's Available wallet balance — just like
 * ending a campaign normally does. Nothing is physically removed: the row and
 * all of its financial + audit history are preserved. A hard delete is
 * impossible for a funded campaign anyway — the two ledgers reference campaigns
 * ON DELETE RESTRICT and are immutable — so "delete" is always this soft delete.
 * Paid-out creator earnings are never clawed back. Setting status='ended' also
 * makes the existing submit/review guards reject any new money activity and the
 * brand-wallet math treat the campaign as settled, so no wallet code changes are
 * needed. Idempotent: deleting an already-deleted campaign is a harmless no-op.
 */
export async function DELETE(_req, { params }) {
  const session = await auth();
  if (!session?.user?.id || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  try {
    await db.transaction(async (tx) => {
      // Lock the campaign row for the whole delete decision.
      const [current] = await tx
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, params.id))
        .for("update");
      if (!current) throw failure("Campaign not found", 404);

      // Already archived — return without releasing or auditing a second time.
      // (The row lock also serialises a racing double-delete through this guard.)
      if (current.deletedAt) return;

      // Does this campaign participate in the wallet (a reserve row), and has its
      // budget already been released (e.g. it was ended before being deleted)?
      const [reserveRow] = await tx
        .select({ id: brandWalletLedger.id })
        .from(brandWalletLedger)
        .where(and(eq(brandWalletLedger.campaignId, current.id), eq(brandWalletLedger.action, "reserve")));
      const [releaseRow] = await tx
        .select({ id: brandWalletLedger.id })
        .from(brandWalletLedger)
        .where(and(eq(brandWalletLedger.campaignId, current.id), eq(brandWalletLedger.action, "release")));

      // Archive + close in one shot.
      await tx
        .update(campaigns)
        .set({ status: "ended", deletedAt: new Date() })
        .where(eq(campaigns.id, current.id));

      // Release unused budget back to the brand wallet, exactly like campaign END
      // (§14): only budget − budget_spent, only if positive, only once (the
      // partial-unique index on action='release' is the DB backstop).
      if (reserveRow && !releaseRow) {
        const unused = Number(current.budget) - Number(current.budgetSpent || 0);
        if (unused > 0) {
          await tx.insert(brandWalletLedger).values({
            brandId: current.brandId,
            campaignId: current.id,
            action: "release",
            amount: unused,
            note: "Unused budget released on admin campaign delete",
          });
        }
      }

      // Append-only audit of the admin action.
      await tx.insert(moderationEvents).values({
        adminId: session.user.id,
        targetUserId: current.brandId,
        action: "campaign_deleted",
        relatedCampaignId: current.id,
        previousStatus: current.status,
        newStatus: "ended",
        note: `Admin deleted campaign "${current.title}"`,
      });
    });
  } catch (error) {
    // A racing double-delete trips the partial-unique release index — the release
    // already happened, so the delete is effectively done.
    if (error?.code === "23505" || error?.cause?.code === "23505") {
      return NextResponse.json({ ok: true });
    }
    if (error.status) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }

  return NextResponse.json({ ok: true });
}
