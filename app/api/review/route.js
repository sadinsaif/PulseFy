export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { submissions, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { reviewSchema } from "@/lib/validation";

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

  const { submissionId, status } = parsed.data;

  const existing = await db
    .select()
    .from(submissions)
    .where(eq(submissions.id, submissionId));
  if (!existing[0]) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  await db
    .update(submissions)
    .set({ status })
    .where(eq(submissions.id, submissionId));

  return NextResponse.json({ ok: true, status });
}
