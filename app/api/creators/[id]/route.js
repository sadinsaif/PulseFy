export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { users, submissions } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

/**
 * GET /api/creators/[id]
 * Public profile of one creator: their profile fields, aggregate stats, and
 * their approved clips (portfolio). Any signed-in user can view it.
 */
export async function GET(_req, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      image: users.image,
      bio: users.bio,
      twitter: users.twitter,
      instagram: users.instagram,
      interests: users.interests,
    })
    .from(users)
    .where(eq(users.id, params.id));

  const profile = rows[0];
  if (!profile) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  const all = await db
    .select({
      id: submissions.id,
      challengeId: submissions.challengeId,
      platform: submissions.platform,
      postUrl: submissions.postUrl,
      status: submissions.status,
      reward: submissions.reward,
      createdAt: submissions.createdAt,
    })
    .from(submissions)
    .where(eq(submissions.userId, params.id))
    .orderBy(desc(submissions.createdAt));

  const approvedRows = all.filter((s) => s.status === "approved");
  const rejected = all.filter((s) => s.status === "rejected").length;
  const reviewed = approvedRows.length + rejected;
  const stats = {
    submitted: all.length,
    approved: approvedRows.length,
    rejected,
    approvalRate: reviewed ? Math.round((approvedRows.length / reviewed) * 100) : 0,
    earnings: approvedRows.reduce((sum, s) => sum + (s.reward || 0), 0),
  };

  // Public portfolio = approved clips only.
  return NextResponse.json({ profile, stats, clips: approvedRows });
}
