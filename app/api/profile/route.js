export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { campaigns, users, submissions } from "@/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { profileSchema } from "@/lib/validation";
import { canViewPrivateCampaignData, participantCampaignIds } from "@/lib/campaign-access";
import { getCreatorBalanceCents } from "@/lib/creator-balance";

/**
 * GET /api/profile
 * Returns the signed-in user's profile, their submissions, and computed stats
 * (submitted / approved / rejected / approval rate / total earnings).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const rows = await db.select().from(users).where(eq(users.id, session.user.id));
  const u = rows[0];
  if (!u) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const subs = await db
    .select()
    .from(submissions)
    .where(eq(submissions.userId, session.user.id))
    .orderBy(desc(submissions.createdAt));

  const campaignIds = [...new Set(subs.map((submission) => submission.campaignId).filter(Boolean))];
  const campaignRows = campaignIds.length
    ? await db.select({ id: campaigns.id, brandId: campaigns.brandId, visibility: campaigns.visibility })
      .from(campaigns).where(inArray(campaigns.id, campaignIds))
    : [];
  const campaignById = new Map(campaignRows.map((campaign) => [campaign.id, campaign]));
  const participantIds = await participantCampaignIds(session.user.id, campaignIds);
  // A revoked creator may retain ledger-backed account totals, but must not
  // receive private campaign-derived submission content through this endpoint.
  const visibleSubs = subs.filter((submission) =>
    !submission.campaignId || (
      campaignById.has(submission.campaignId) &&
      canViewPrivateCampaignData(campaignById.get(submission.campaignId), session, participantIds)
    )
  );

  const approved = visibleSubs.filter((s) => s.status === "approved");
  const rejected = visibleSubs.filter((s) => s.status === "rejected");
  const reviewed = approved.length + rejected.length;
  const totalViews = visibleSubs.reduce((sum, s) => sum + (s.views || 0), 0);
  const totalEngagement = visibleSubs.reduce((sum, s) => sum + (s.engagement || 0), 0);
  const { earnedCents } = await getCreatorBalanceCents(db, session.user.id);

  const profile = {
    role: u.role,
    name: u.name || "",
    email: u.email,
    username: u.username || "",
    bio: u.bio || "",
    image: u.image || "",
    twitter: u.twitter || "",
    instagram: u.instagram || "",
    interests: u.interests || "",
  };

  const stats = {
    submitted: visibleSubs.length,
    approved: approved.length,
    rejected: rejected.length,
    pending: visibleSubs.length - reviewed,
    approvalRate: reviewed ? Math.round((approved.length / reviewed) * 100) : 0,
    // Ledger-backed earned funds; availability remains exposed by /api/withdrawals.
    earnings: earnedCents / 100,
    views: totalViews,
    engagement: totalEngagement,
    // Overall engagement rate across all posts (GIMI-style), one decimal.
    rate: totalViews > 0 ? ((totalEngagement / totalViews) * 100).toFixed(1) : "0.0",
  };

  return NextResponse.json({ profile, stats, submissions: visibleSubs });
}

/** POST /api/profile — update the signed-in user's profile fields. */
export async function POST(req) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }

  const d = parsed.data;
  await db
    .update(users)
    .set({
      name: d.name.trim(),
      username: (d.username || "").trim() || null,
      bio: (d.bio || "").trim() || null,
      twitter: (d.twitter || "").trim() || null,
      instagram: (d.instagram || "").trim() || null,
      interests: (d.interests || "").trim() || null,
      image: (d.image || "").trim() || null,
    })
    .where(eq(users.id, session.user.id));

  return NextResponse.json({ ok: true, message: "Profile updated." });
}
