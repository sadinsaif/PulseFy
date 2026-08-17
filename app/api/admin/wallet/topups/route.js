export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { brandTopups, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { isAdminEmail } from "@/lib/admin";

/**
 * GET /api/admin/wallet/topups — admin list of top-up requests with the brand's
 * name/email so payments can be confirmed. Admin-gated (§4/§19).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const rows = await db
    .select({
      id: brandTopups.id,
      amount: brandTopups.amount,
      status: brandTopups.status,
      reference: brandTopups.reference,
      note: brandTopups.note,
      provider: brandTopups.provider,
      providerChargeId: brandTopups.providerChargeId,
      createdAt: brandTopups.createdAt,
      brandId: brandTopups.brandId,
      brandName: users.name,
      brandEmail: users.email,
    })
    .from(brandTopups)
    .leftJoin(users, eq(brandTopups.brandId, users.id))
    .orderBy(desc(brandTopups.createdAt));

  return NextResponse.json({ topups: rows });
}
