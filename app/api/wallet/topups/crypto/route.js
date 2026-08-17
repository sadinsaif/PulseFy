export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { brandTopups, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isAdminEmail } from "@/lib/admin";
import { topUpSchema } from "@/lib/validation";
import { CRYPTO_PROVIDER, isCryptoEnabled, createInvoice } from "@/lib/nowpayments";

async function requireBrand(session) {
  const [currentUser] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, session.user.id));
  return currentUser?.role === "brand" || isAdminEmail(session.user.email);
}

/**
 * POST /api/wallet/topups/crypto — start an automatic crypto top-up via
 * NOWPayments hosted checkout. This creates the SAME pending brand_topups row
 * the manual flow does (moving no balance, §5), gets a hosted payment URL, and
 * returns it for the client to redirect to. The balance is credited only later,
 * when NOWPayments' signed IPN reports the payment `finished` and drives the
 * top-up to `completed` (§4). The response is honest — never "successful".
 */
export async function POST(req) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }
  if (!(await requireBrand(session))) {
    return NextResponse.json(
      { error: "Only brand accounts have a wallet." },
      { status: 403 }
    );
  }

  // Fail closed — if the provider isn't configured this path is simply off, and
  // the honest manual top-up flow remains the only option (mirrors isAdminEmail).
  if (!isCryptoEnabled()) {
    return NextResponse.json(
      { error: "Crypto payments aren't available right now." },
      { status: 503 }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = topUpSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid amount" },
      { status: 400 }
    );
  }
  const amount = parsed.data.amount;

  // Create the pending row FIRST so there's a stable id to correlate the
  // payment to (we pass it as the invoice order_id). It moves no balance — like
  // every top-up it only counts once `completed`. If invoice creation fails
  // below, this harmless $0-effect pending row is simply left in place (§17
  // never delete).
  const [inserted] = await db
    .insert(brandTopups)
    .values({
      brandId: session.user.id,
      amount,
      status: "pending",
      provider: CRYPTO_PROVIDER,
    })
    .returning();

  const baseUrl =
    process.env.AUTH_URL || process.env.NEXTAUTH_URL || new URL(req.url).origin;

  let invoice;
  try {
    invoice = await createInvoice({
      topupId: inserted.id,
      brandId: session.user.id,
      amount,
      baseUrl,
    });
  } catch (err) {
    console.error("NOWPayments invoice creation failed:", err);
    return NextResponse.json(
      { error: "Couldn't start the crypto payment. Please try again." },
      { status: 502 }
    );
  }

  // Persist the invoice id for DB-level idempotency + audit correlation.
  await db
    .update(brandTopups)
    .set({ providerChargeId: invoice.id, updatedAt: new Date() })
    .where(eq(brandTopups.id, inserted.id));

  return NextResponse.json({
    ok: true,
    hosted_url: invoice.invoice_url,
    topup: { id: inserted.id, amount, status: "pending" },
    message:
      "Complete the payment on the next screen — your balance updates once it's confirmed.",
  });
}
