import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { submissions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { submissionSchema } from "@/lib/validation";

/**
 * POST /api/submit
 * Creators submit their published clip to a challenge. Auth required.
 */
export async function POST(req) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "You must be signed in to submit." }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = submissionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }

  const { challengeId, platform, postUrl, caption } = parsed.data;

  // One submission per creator per challenge — update the link if they resubmit.
  const existing = await db
    .select()
    .from(submissions)
    .where(
      and(
        eq(submissions.userId, session.user.id),
        eq(submissions.challengeId, challengeId)
      )
    );

  if (existing[0]) {
    await db
      .update(submissions)
      .set({ platform, postUrl, caption: caption || null, status: "pending" })
      .where(eq(submissions.id, existing[0].id));
    return NextResponse.json({
      ok: true,
      updated: true,
      message: "Your submission was updated and is back in review.",
    });
  }

  await db.insert(submissions).values({
    challengeId,
    userId: session.user.id,
    platform,
    postUrl,
    caption: caption || null,
  });

  return NextResponse.json(
    { ok: true, message: "Submission received — it's now in review." },
    { status: 201 }
  );
}

/**
 * GET /api/submit?challengeId=...
 * Returns the signed-in creator's own submission for a challenge (if any).
 */
export async function GET(req) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const challengeId = new URL(req.url).searchParams.get("challengeId") || "";
  if (!challengeId) {
    return NextResponse.json({ error: "Missing challengeId" }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(submissions)
    .where(
      and(
        eq(submissions.userId, session.user.id),
        eq(submissions.challengeId, challengeId)
      )
    );

  return NextResponse.json({ submission: rows[0] || null });
}
