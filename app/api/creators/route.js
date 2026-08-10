export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, desc, ilike, sql } from "drizzle-orm";
import { isAdminEmail } from "@/lib/admin";

/**
 * GET /api/creators?q=...
 * Public directory of creators (everyone who isn't a brand). Optional name /
 * username search. Each row carries quick stats (approved clips + earnings).
 *
 * ?rich=1  → brand "Discover Creators" view: adds follower count, average
 *            views, engagement rate and the platforms they post on, and honours
 *            the filter params (platform, minFollowers, minViews, minEngagement,
 *            sort). The lean default path (used by the creator Leaderboard) is
 *            left exactly as before.
 */
export async function GET(req) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const params = new URL(req.url).searchParams;
  const q = (params.get("q") || "").trim();
  const rich = params.get("rich") === "1";

  // The rich "Discover Creators" dataset is brand-only — it mirrors the
  // page-level gate on /dashboard/discover. Without this check an authenticated
  // creator could pull the brand-only stats straight from the API. The lean
  // default path stays open to every signed-in user (it powers the creator
  // Leaderboard) and is left exactly as before.
  if (rich) {
    const [currentUser] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, session.user.id));
    if (currentUser?.role !== "brand" && !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Public discovery must not reveal activity, earnings, or platforms from a
  // private campaign or a campaign that hides contributions.
  const publicContribution = sql`(
    submissions.campaign_id is null or exists (
      select 1 from campaigns c
      where c.id = submissions.campaign_id
        and c.visibility is distinct from 'private'
        and c.show_contributions is distinct from 'no'
    )
  )`;
  const approved = sql`(select count(*) from submissions where submissions.user_id = ${users.id} and submissions.status = 'approved' and ${publicContribution})`;
  // Total dollars earned = approved campaign rewards + spotlight bonuses
  // (mirrors the creator profile's "earnings"). Drives the leaderboard rank.
  const earnings = sql`(
    (select coalesce(sum(reward),0) from submissions where submissions.user_id = ${users.id} and submissions.status = 'approved' and ${publicContribution})
    + (select coalesce(sum(spotlight_bonus),0) from submissions where submissions.user_id = ${users.id} and submissions.spotlighted = true and ${publicContribution})
  )`;

  const notBrand = sql`${users.role} is distinct from 'brand'`;

  // ---- Lean default path (creator Leaderboard) — UNCHANGED ------------------
  if (!rich) {
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

  // ---- Rich path (brand Discover Creators) ---------------------------------
  // Per-creator aggregates derived from their submissions + followers.
  const followers = sql`(select count(*) from follows where follows.following_id = ${users.id})`;
  const avgViews = sql`(select coalesce(round(avg(views)),0) from submissions where submissions.user_id = ${users.id} and ${publicContribution})`;
  const engagementRate = sql`(
    select case when coalesce(sum(views),0) > 0
      then round(sum(engagement)::numeric / sum(views)::numeric * 100, 1)
      else 0 end
    from submissions where submissions.user_id = ${users.id} and ${publicContribution}
  )`;
  const platforms = sql`(select string_agg(distinct platform, ',') from submissions where submissions.user_id = ${users.id} and ${publicContribution})`;

  // Filters (all optional). Numeric params coerced; NaN → no filter.
  const platform = (params.get("platform") || "").trim();
  const minFollowers = Number(params.get("minFollowers")) || 0;
  const minViews = Number(params.get("minViews")) || 0;
  const minEngagement = Number(params.get("minEngagement")) || 0;
  const sort = params.get("sort") || "followers";

  const conds = [notBrand];
  if (q) {
    conds.push(
      sql`(${ilike(users.name, `%${q}%`)} or ${ilike(users.username, `%${q}%`)})`
    );
  }
  if (platform && platform !== "any") {
    conds.push(
      sql`exists (select 1 from submissions where submissions.user_id = ${users.id} and submissions.platform = ${platform} and ${publicContribution})`
    );
  }
  if (minFollowers > 0) conds.push(sql`${followers} >= ${minFollowers}`);
  if (minViews > 0) conds.push(sql`${avgViews} >= ${minViews}`);
  if (minEngagement > 0) conds.push(sql`${engagementRate} >= ${minEngagement}`);

  const orderBy =
    sort === "avgViews"
      ? desc(avgViews)
      : sort === "engagement"
      ? desc(engagementRate)
      : sort === "earnings"
      ? desc(earnings)
      : desc(followers);

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      image: users.image,
      bio: users.bio,
      interests: users.interests,
      approved,
      earnings,
      followers,
      avgViews,
      engagementRate,
      platforms,
    })
    .from(users)
    .where(and(...conds))
    .orderBy(orderBy, desc(approved))
    .limit(60);

  return NextResponse.json({ creators: rows });
}
