export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { desc, ilike, sql } from "drizzle-orm";

/**
 * GET /api/creators?q=...
 * Public directory of creators (everyone who isn't a brand). Optional name /
 * username search. Each row carries quick stats (approved clips + earnings).
 */
export async function GET(req) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const q = (new URL(req.url).searchParams.get("q") || "").trim();

  const approved = sql`(select count(*) from submissions where submissions.user_id = ${users.id} and submissions.status = 'approved')`;
  // Total dollars earned = approved campaign rewards + spotlight bonuses
  // (mirrors the creator profile's "earnings"). Drives the leaderboard rank.
  const earnings = sql`(
    (select coalesce(sum(reward),0) from submissions where submissions.user_id = ${users.id} and submissions.status = 'approved')
    + (select coalesce(sum(spotlight_bonus),0) from submissions where submissions.user_id = ${users.id} and submissions.spotlighted = true)
  )`;

  const notBrand = sql`${users.role} is distinct from 'brand'`;
  const where = q
    ? sql`${notBrand} and (${ilike(users.name, `%${q}%`)} or ${ilike(users.username, `%${q}%`)})`
    : notBrand;

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      image: users.image,
      bio: users.bio,
      approved,
      earnings,
    })
    .from(users)
    .where(where)
    .orderBy(desc(earnings), desc(approved))
    .limit(60);

  return NextResponse.json({ creators: rows });
}
