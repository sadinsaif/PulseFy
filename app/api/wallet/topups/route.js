export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { brandTopups, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { isAdminEmail } from "@/lib/admin";
import { topUpSchema } from "@/lib/validation";
import { notifyAdmins } from "@/lib/notify";

async function requireBrand(session) {
  const [currentUser] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, session.user.id));
  return currentUser?.role === "brand" || isAdminEmail(session.user.email);
}

/**
 * GET /api/wallet/topups — the signed-in brand's own top-up requests, newest
 * first. Brand-scoped by session (§19).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (!(await requireBrand(session))) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const rows = await db
    .select({
      id: brandTopups.id,
      amount: brandTopups.amount,
      status: brandTopups.status,
      createdAt: brandTopups.createdAt,
    })
    .from(brandTopups)
    .where(eq(brandTopups.brandId, session.user.id))
    .orderBy(desc(brandTopups.createdAt));

  return NextResponse.json({ topups: rows });
}

/**
 * POST /api/wallet/topups — a brand requests to add money to its wallet. The
 * top-up is created `pending` and does NOT change any balance yet: it only
 * counts toward Available once an admin confirms it with a payment reference
 * (§4/§5). The response is deliberately honest — "requested, pending
 * confirmation" — never "successful".
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

  const [inserted] = await db
    .insert(brandTopups)
    .values({
      brandId: session.user.id,
      amount,
      status: "pending",
    })
    .returning();

  const who = session.user.name || session.user.email || "A brand";
  await notifyAdmins({
    type: "topup",
    message: `${who} requested a $${amount.toLocaleString()} wallet top-up — confirm the payment to credit it.`,
    link: "/dashboard/payouts",
  });

  return NextResponse.json(
    {
      ok: true,
      topup: inserted,
      message: "Top-up requested — pending confirmation.",
    },
    { status: 201 }
  );
}
