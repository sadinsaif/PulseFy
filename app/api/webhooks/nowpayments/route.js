export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { notifyUser, notifyAdmins } from "@/lib/notify";
import {
  CRYPTO_PROVIDER,
  isCryptoEnabled,
  verifyIpnSignature,
  classifyStatus,
  extractReference,
} from "@/lib/nowpayments";
import { applyTopupTransition } from "@/lib/topup-transition";

/**
 * POST /api/webhooks/nowpayments — NOWPayments IPN (Instant Payment Notification).
 *
 * PUBLIC (no session): middleware excludes /api, so this endpoint is
 * authenticated SOLELY by verifying the HMAC-SHA512 signature over the payload
 * (§19). It drives the exact same pending → processing → completed transition an
 * admin does today, so NO balance is credited until NOWPayments reports the
 * payment `finished` (§4/§5). Idempotent: a re-delivered IPN hits the
 * already-at-status / terminal-state guards in applyTopupTransition and safely
 * no-ops.
 *
 * Correlation: NOWPayments echoes our `order_id` (the top-up id — an unguessable
 * server UUID) in every IPN, but NOT the invoice id we stored. So we correlate
 * via the fallback-id path and assert the row's provider is NOWPayments
 * (expectedProvider) — the guard in applyTopupTransition makes a signed IPN
 * unable to touch a manual or other-rail row.
 */
export async function POST(req) {
  // Read the raw body first — we must parse it to verify (the signature is over
  // the canonical sorted-key JSON, so we JSON.parse before trusting anything).
  const raw = await req.text();

  // Fail closed — with no IPN secret configured we can't trust anything here.
  if (!isCryptoEnabled()) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const signature = req.headers.get("x-nowpayments-sig");
  if (!verifyIpnSignature(payload, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const status = classifyStatus(payload?.payment_status);
  const orderId = payload?.order_id;

  // Not a status-changing update (e.g. an unknown status) or missing our
  // correlation id — acknowledge and stop so NOWPayments doesn't retry.
  if (!status || !orderId) {
    return NextResponse.json({ received: true, ignored: true });
  }

  // The invoice's locked USD price, as a whole-dollar integer, and its currency.
  // Used only when completing, to guarantee we credit the exact requested USD
  // amount and never a non-USD invoice (§18 — no currency mixing).
  const priceCurrency = String(payload?.price_currency || "").toLowerCase();
  const expectedAmount = Math.round(Number(payload?.price_amount));

  if (status === "completed" && priceCurrency !== "usd") {
    // A settled payment priced in something other than USD: never credit it;
    // alert admins to investigate manually (§18/§19).
    await notifyAdmins({
      type: "topup",
      message: `⚠️ Crypto top-up currency mismatch on order ${orderId} (priced ${priceCurrency || "?"}) — not credited. Please review.`,
      link: "/dashboard/payouts",
    }).catch(() => {});
    return NextResponse.json({ received: true, error: "currency_mismatch" });
  }

  let result;
  try {
    result = await applyTopupTransition(
      {
        fallbackTopupId: orderId,
        expectedProvider: CRYPTO_PROVIDER,
      },
      {
        status,
        reference: status === "completed" ? extractReference(payload) : undefined,
        expectedAmount: status === "completed" ? expectedAmount : undefined,
      }
    );
  } catch (err) {
    if (err.code === "amount_mismatch") {
      // A settled payment whose USD amount doesn't match the top-up row: never
      // credit it; alert admins to investigate manually (§18/§19).
      await notifyAdmins({
        type: "topup",
        message: `⚠️ Crypto top-up amount mismatch on order ${orderId} — not credited. Please review.`,
        link: "/dashboard/payouts",
      }).catch(() => {});
      return NextResponse.json({ received: true, error: "amount_mismatch" });
    }
    if (err.status === 409 || err.status === 404 || err.status === 400) {
      // 409 = terminal/no-op (idempotent re-delivery) or provider mismatch;
      // 404/400 = no matching row or malformed selector. Nothing a retry would
      // fix → acknowledge so NOWPayments stops re-sending.
      return NextResponse.json({ received: true, handled: err.status });
    }
    // Unexpected (e.g. transient DB error) → 500 so NOWPayments retries later and
    // a real confirmation is never lost.
    console.error("NOWPayments webhook processing error:", err);
    return NextResponse.json({ error: "Processing error" }, { status: 500 });
  }

  // Notify the brand only on a real change (never on an idempotent no-op).
  if (result.changed) {
    const amt = Number(result.current.amount).toLocaleString();
    let message = null;
    if (status === "completed") {
      message = `Your $${amt} crypto wallet top-up is confirmed and added to your balance ✅`;
    } else if (status === "failed") {
      message = `Your $${amt} crypto wallet top-up could not be confirmed.`;
    }
    if (message) {
      await notifyUser(result.current.brandId, {
        type: "topup",
        message,
        link: "/dashboard/payouts",
      }).catch(() => {});
    }
  }

  return NextResponse.json({ received: true, status });
}
