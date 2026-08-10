export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { campaigns, creatorPortfolio, creatorSocialLinks, reviews, users } from "@/db/schema";
import { getTrustScore } from "@/lib/trust-score";

// Public-to-authenticated profile trust data. Intentionally omits email,
// moderation notes, report history, and hidden reviews.
export async function GET(req) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Missing user" }, { status: 400 });
  const [profile] = await db.select({ id: users.id, name: users.name, username: users.username, company: users.company, role: users.role, isVerified: users.isVerified })
    .from(users).where(eq(users.id, userId));
  if (!profile) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const [recent, portfolio, socialLinks, trust] = await Promise.all([
    // Reviews originating in private campaigns and reviews by currently blocked
    // authors are never part of the public trust profile.
    db.select({ id: reviews.id, rating: reviews.rating, comment: reviews.comment, reviewerType: reviews.reviewerType, createdAt: reviews.createdAt, reviewerName: users.name, reviewerUsername: users.username })
      .from(reviews)
      .innerJoin(users, eq(reviews.reviewerId, users.id))
      .innerJoin(campaigns, eq(reviews.campaignId, campaigns.id))
      .where(and(
        eq(reviews.revieweeId, userId),
        eq(reviews.status, "visible"),
        sql`${campaigns.visibility} is distinct from 'private'`,
        sql`${users.moderationStatus} not in ('suspended', 'banned')`
      ))
      .orderBy(desc(reviews.createdAt)).limit(8),
    profile.role === "creator" ? db.select().from(creatorPortfolio).where(eq(creatorPortfolio.creatorId, userId)).orderBy(creatorPortfolio.displayOrder, desc(creatorPortfolio.createdAt)) : [],
    profile.role === "creator" ? db.select({ id: creatorSocialLinks.id, platform: creatorSocialLinks.platform, url: creatorSocialLinks.url }).from(creatorSocialLinks).where(eq(creatorSocialLinks.creatorId, userId)) : [],
    getTrustScore(db, userId),
  ]);
  return NextResponse.json({ profile, trust, reviews: recent, portfolio, socialLinks });
}
