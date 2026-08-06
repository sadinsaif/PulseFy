export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { submissions, users } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";

// Most spotlighted posts we show in the public showcase.
const MAX = 24;

/**
 * GET /api/spotlight
 * Public "Spotlighted" showcase — every post an admin highlighted, joined with
 * the creator's name/username/avatar so the card can link to their profile.
 * Any signed-in user can view it (matches the rest of the dashboard).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let rows = [];
  try {
    rows = await db
      .select({
        id: submissions.id,
        challengeId: submissions.challengeId,
        platform: submissions.platform,
        postUrl: submissions.postUrl,
        reward: submissions.reward,
        spotlightBonus: submissions.spotlightBonus,
        views: submissions.views,
        engagement: submissions.engagement,
        createdAt: submissions.createdAt,
        creatorId: submissions.userId,
        creatorName: users.name,
        creatorUsername: users.username,
        creatorImage: users.image,
      })
      .from(submissions)
      .leftJoin(users, eq(submissions.userId, users.id))
      .where(eq(submissions.spotlighted, true))
      .orderBy(desc(submissions.spotlightBonus), desc(submissions.createdAt))
      .limit(MAX);
  } catch {
    rows = [];
  }

  return NextResponse.json({ spotlights: rows });
}
