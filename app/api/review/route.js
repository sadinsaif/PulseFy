export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { submissions, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { reviewSchema } from "@/lib/validation";
import { isAdminEmail } from "@/lib/admin";
import { notifyUser } from "@/lib/notify";

/**
 * GET /api/review
 * Returns every submission (newest first) joined with the creator's name/email
 * so the brand owner can review them. Auth required.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (!isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  const rows = await db
    .select({
      id: submissions.id,
      challengeId: submissions.challengeId,
      platform: submissions.platform,
      postUrl: submissions.postUrl,
      caption: submissions.caption,
      status: submissions.status,
      createdAt: submissions.createdAt,
      creatorName: users.name,
      creatorEmail: users.email,
    })
    .from(submissions)
    .leftJoin(users, eq(submissions.userId, users.id))
    .orderBy(desc(submissions.createdAt));

  return NextResponse.json({ submissions: rows });
}

/**
 * POST /api/review
 * Approve or reject a submission. Auth required.
 * Body: { submissionId, status: "approved" | "rejected" | "pending" }
 */
export async function POST(req) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }
  if (!isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }

  const { submissionId, status, reward } = parsed.data;

  const existing = await db
    .select()
    .from(submissions)
    .where(eq(submissions.id, submissionId));
  if (!existing[0]) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  // On approval, set the reward (default keeps prior value). On reject, zero it.
  const patch = { status };
  if (status === "approved") {
    patch.reward = reward != null ? reward : existing[0].reward || 0;
  } else if (status === "rejected") {
    patch.reward = 0;
  }

  await db
    .update(submissions)
    .set(patch)
    .where(eq(submissions.id, submissionId));

  // Tell the creator their post was reviewed (skip "pending" resets).
  if (status === "approved" || status === "rejected") {
    const verb =
      status === "approved"
        ? patch.reward > 0
          ? `approved ✅ — you earned $${patch.reward}`
          : "approved ✅"
        : "rejected";
    await notifyUser(existing[0].userId, {
      type: "review",
      message: `Your submission to ${existing[0].challengeId} was ${verb}.`,
      link: "/dashboard/profile",
    });
  }

  return NextResponse.json({ ok: true, status, reward: patch.reward });
}
