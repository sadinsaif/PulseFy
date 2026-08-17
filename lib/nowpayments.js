import crypto from "node:crypto";

/**
 * NOWPayments integration for automatic crypto wallet top-ups.
 *
 * Design mirrors lib/email.js (lazy — read env only when actually calling) and
 * lib/admin.js (fail closed — if the keys aren't configured, the feature is OFF
 * and the existing honest manual-confirm flow is 100% untouched).
 *
 * Money safety (§4/§5/§18/§19):
 *  - Invoices are created as a fixed USD price from a whole-dollar integer.
 *  - The IPN webhook is authenticated ONLY by verifying the HMAC signature.
 *  - No balance is credited here — a `finished` payment merely drives the same
 *    pending → completed top-up transition an admin does today, and the balance
 *    stays derived in lib/brand-wallet.js. We never call "success" before
 *    NOWPayments confirms the payment is fully settled on-chain.
 */

// The value stored in brand_topups.provider for crypto rows, and the provider
// the IPN webhook asserts a row must belong to before acting on it.
export const CRYPTO_PROVIDER = "nowpayments";

// Live API by default; override to the sandbox base for test integrations.
const API_BASE = process.env.NOWPAYMENTS_API_BASE || "https://api.nowpayments.io/v1";

/**
 * Feature gate. True only when BOTH the API key and the IPN secret are
 * configured — creating an invoice is useless if we can't later verify the IPN
 * that confirms it. Fail closed, exactly like isAdminEmail().
 */
export function isCryptoEnabled() {
  return !!(
    process.env.NOWPAYMENTS_API_KEY &&
    process.env.NOWPAYMENTS_IPN_SECRET
  );
}

/**
 * Create a hosted NOWPayments invoice for a pending top-up.
 * `amount` is a whole-dollar integer (USD); it is sent as a fixed USD price with
 * no floating-point math. `order_id` carries our top-up id so the IPN can
 * correlate the payment back to the exact top-up row (it is an unguessable
 * server UUID, present in every IPN). `ipn_callback_url` is where NOWPayments
 * POSTs signed payment updates.
 *
 * Returns { id, invoice_url }. Throws on a non-2xx response so the caller can
 * leave the pending row in place (§17 — never deleted) and return an honest
 * error to the brand.
 */
export async function createInvoice({ topupId, brandId, amount, baseUrl }) {
  if (!isCryptoEnabled()) {
    throw new Error("Crypto payments are not configured");
  }
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("Invoice amount must be a positive whole-dollar integer");
  }

  const returnUrl = `${baseUrl}/dashboard/payouts?topup=${encodeURIComponent(topupId)}`;
  const ipnUrl = `${baseUrl}/api/webhooks/nowpayments`;

  const res = await fetch(`${API_BASE}/invoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.NOWPAYMENTS_API_KEY,
    },
    body: JSON.stringify({
      // Integer dollars — NOWPayments locks the USD price and quotes the crypto
      // equivalent at checkout. No float on our side.
      price_amount: amount,
      price_currency: "usd",
      order_id: topupId,
      order_description: `Add $${amount} to your PulseFy brand wallet`,
      ipn_callback_url: ipnUrl,
      success_url: returnUrl,
      cancel_url: returnUrl,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `NOWPayments invoice failed (${res.status}): ${text.slice(0, 500)}`
    );
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("NOWPayments returned an unparseable response");
  }
  if (!json?.id || !json?.invoice_url) {
    throw new Error("NOWPayments response missing invoice id / invoice_url");
  }
  // NOWPayments returns the invoice id as a number — store it as a string to
  // match our text column and keep correlation/idempotency comparisons exact.
  return { id: String(json.id), invoice_url: json.invoice_url };
}

/**
 * Recursively sort an object's keys (arrays preserved in order). NOWPayments
 * computes the IPN signature over the JSON of the payload with keys sorted this
 * way, so we must reproduce the exact same canonical form to verify it.
 */
function sortObjectKeys(value) {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortObjectKeys(value[key]);
        return acc;
      }, {});
  }
  return value;
}

/**
 * Verify a NOWPayments IPN. The `x-nowpayments-sig` header is the HMAC-SHA512
 * hex digest of the JSON body with its keys recursively sorted, computed with
 * the IPN secret. Unlike a raw-body HMAC, the signature is over the CANONICAL
 * (sorted-key) JSON, so we take the already-parsed payload, re-serialize it in
 * that canonical form, and compare. Constant-time compare; any error → false.
 *
 * Fail-closed: if the algorithm were ever subtly wrong, real IPNs would be
 * REJECTED (nothing credited) rather than a forged one being accepted.
 */
export function verifyIpnSignature(payload, signatureHeader) {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret || !signatureHeader || !payload || typeof payload !== "object") {
    return false;
  }
  try {
    const canonical = JSON.stringify(sortObjectKeys(payload));
    const expected = crypto
      .createHmac("sha512", secret)
      .update(canonical, "utf8")
      .digest("hex");
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(String(signatureHeader).trim(), "hex");
    if (a.length !== b.length || a.length === 0) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Map a NOWPayments payment_status to our top-up status, or null to ignore.
 * §4: nothing credits until the payment is fully settled — only `finished`
 * completes.
 *   finished                                              → completed (credit)
 *   waiting|confirming|confirmed|sending|partially_paid   → processing (no credit)
 *   failed|expired|refunded                               → failed
 *   anything else                                         → null (ignore, just ack)
 *
 * `confirmed` (blockchain-confirmed but not yet settled by NOWPayments) and
 * `partially_paid` deliberately stay `processing` — they are NOT success, and
 * an admin can Fail/Cancel a stuck row via the manual fallback.
 */
export function classifyStatus(paymentStatus) {
  switch (paymentStatus) {
    case "finished":
      return "completed";
    case "waiting":
    case "confirming":
    case "confirmed":
    case "sending":
    case "partially_paid":
      return "processing";
    case "failed":
    case "expired":
    case "refunded":
      return "failed";
    default:
      return null;
  }
}

/**
 * Best-effort human-readable payment reference for a settled payment: the
 * NOWPayments payment id (prefixed with the paid currency when present),
 * falling back to purchase/order id. Never used for authorization — display
 * and audit only.
 */
export function extractReference(payload) {
  const pid = payload?.payment_id;
  if (pid) {
    const cur = payload?.pay_currency ? `${payload.pay_currency}:` : "";
    return `${cur}nowpayments#${pid}`.slice(0, 200);
  }
  if (payload?.purchase_id) return `nowpayments:${payload.purchase_id}`.slice(0, 200);
  if (payload?.order_id) return `nowpayments:${payload.order_id}`.slice(0, 200);
  return "nowpayments";
}
