import { db } from "@/db";
import { brandTopups } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * The single, authoritative brand-topup status transition — shared by the admin
 * confirm route and the crypto webhook so there is exactly ONE copy of the
 * row-lock + terminal-immutability + amount-match logic (§4/§5/§17/§18/§19).
 *
 * Marking a top-up `completed` IS the credit — balances are derived in
 * lib/brand-wallet.js from completed rows, so this writes no balance column.
 *
 * selector:
 *   { id }                                          — used by the admin route
 *   { fallbackTopupId, expectedProvider }           — used by the crypto webhook;
 *                                                     correlates by the top-up id
 *                                                     we passed to the provider,
 *                                                     and asserts the row belongs
 *                                                     to that provider
 *   { providerChargeId, fallbackTopupId, expectedProvider } — also supported: try
 *                                                     the stored charge id first,
 *                                                     then the fallback id
 *
 * opts:
 *   status         — "processing" | "completed" | "failed" | "cancelled"
 *   reference      — payment reference; recorded only when completing
 *   note           — optional internal note
 *   expectedAmount — when completing, must equal the row's amount or we refuse
 *                    to credit (guards against a wrong-amount charge; §18)
 *
 * Returns { current, changed }. The caller is responsible for notifyUser so the
 * message wording stays owned by each entry point. Errors carry `.status`
 * (404 / 409 / 422) and `.code` for callers to map to HTTP responses.
 */
export async function applyTopupTransition(selector, opts) {
  const { status, reference, note, expectedAmount } = opts || {};
  const ref = typeof reference === "string" ? reference.trim() : "";

  return db.transaction(async (tx) => {
    // Lock the target row for the duration of the transition so a concurrent
    // webhook + admin PATCH (or a webhook re-delivery) can't race.
    let current;
    // True only when the row was resolved via the fallback top-up id (the
    // provider's order_id / charge metadata) — not a stored charge-id match and
    // not the admin { id } path. That one branch gets an extra provider check
    // below, since it is how NOWPayments IPNs correlate.
    let viaFallback = false;
    if (selector?.id) {
      [current] = await tx
        .select()
        .from(brandTopups)
        .where(eq(brandTopups.id, selector.id))
        .for("update");
    } else if (selector?.providerChargeId) {
      [current] = await tx
        .select()
        .from(brandTopups)
        .where(eq(brandTopups.providerChargeId, selector.providerChargeId))
        .for("update");
      // Race: webhook arrived before we persisted the charge id → correlate via
      // the top-up id we put in the charge metadata.
      if (!current && selector.fallbackTopupId) {
        viaFallback = true;
        [current] = await tx
          .select()
          .from(brandTopups)
          .where(eq(brandTopups.id, selector.fallbackTopupId))
          .for("update");
      }
    } else if (selector?.fallbackTopupId) {
      viaFallback = true;
      [current] = await tx
        .select()
        .from(brandTopups)
        .where(eq(brandTopups.id, selector.fallbackTopupId))
        .for("update");
    } else {
      const error = new Error("No top-up selector provided");
      error.status = 400;
      throw error;
    }

    if (!current) {
      const error = new Error("Top-up not found");
      error.status = 404;
      throw error;
    }

    // Defence-in-depth: the fallback path resolved this row purely by an id we
    // handed to the payment provider (its order_id / charge metadata). It must
    // only ever drive a top-up funded by that SAME provider — never a manual
    // (provider = null) row or one funded by a different rail. This is the
    // PRIMARY correlation path for NOWPayments (whose IPN carries our order_id,
    // not the stored invoice id), so the guard is load-bearing, not theoretical:
    // it keeps a signed IPN from ever mutating the wrong kind of row. The admin
    // { id } path and the stored-charge-id match are deliberately exempt (admins
    // confirm manual rows; a stored charge id already proves a provider row).
    if (viaFallback && current.provider !== selector.expectedProvider) {
      const error = new Error(
        "Refusing to act on a top-up whose provider does not match the webhook."
      );
      error.status = 409;
      throw error;
    }

    // Already at the target status — idempotent no-op (safe for webhook
    // re-delivery). Not "changed", so the caller sends no duplicate notice.
    if (current.status === status) return { current, changed: false };

    // Terminal states are final — never rewrite a completed/failed/cancelled
    // financial record (§17). This is also the idempotency backstop against a
    // second `confirmed` webhook double-crediting.
    if (["completed", "failed", "cancelled"].includes(current.status)) {
      const error = new Error(
        `A ${current.status} top-up is final and cannot be changed.`
      );
      error.status = 409;
      throw error;
    }

    // When crediting, the confirmed charge's USD amount must match the row
    // (§18) — never credit a different amount than the brand requested.
    if (status === "completed" && expectedAmount != null) {
      if (!Number.isFinite(expectedAmount) || expectedAmount !== current.amount) {
        const error = new Error(
          `Top-up amount mismatch: row is $${current.amount}, charge was $${expectedAmount}.`
        );
        error.status = 422;
        error.code = "amount_mismatch";
        throw error;
      }
    }

    const set = {
      status,
      // Reference is the honest "money confirmed" audit trail — recorded only
      // on completion, preserved otherwise (identical to the admin route).
      reference: status === "completed" && ref ? ref : current.reference,
      note: typeof note === "string" && note.trim() ? note.trim() : current.note,
      updatedAt: new Date(),
    };
    // Opportunistically bind the charge id if the webhook found the row via the
    // metadata fallback — tightens future correlation + the unique-index guard.
    if (selector?.providerChargeId && !current.providerChargeId) {
      set.providerChargeId = selector.providerChargeId;
    }

    await tx.update(brandTopups).set(set).where(eq(brandTopups.id, current.id));

    return { current, changed: true };
  });
}
