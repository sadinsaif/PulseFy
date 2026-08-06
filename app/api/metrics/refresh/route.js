export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { submissions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { fetchMetrics } from "@/lib/metrics";
import { isAdminEmail } from "@/lib/admin";

/**
 * POST /api/metrics/refresh
 * Re-fetches REAL metrics (YouTube only for now) and updates the rows.
 * Body (optional): { submissionId } to refresh a single one.
 *
 * A creator can refresh their OWN submissions; an admin can refresh any.
 * Counts grow over time, so this is the "pull latest numbers" action.
 */
export async function POST(req) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const admin = isAdminEmail(session.user.email);

  let body = {};
  try {
    body = await req.json();
  } catch {
    /* no body — refresh all of the caller's submissions */
  }
  const submissionId = body?.submissionId;

  // Pick the rows to refresh. Non-admins are always scoped to their own rows.
  let rows;
  if (submissionId) {
    rows = await db.select().from(submissions).where(eq(submissions.id, submissionId));
    if (!rows[0]) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }
    if (!admin && rows[0].userId !== session.user.id) {
      return NextResponse.json({ error: "Not your submission." }, { status: 403 });
    }
  } else if (admin) {
    rows = await db.select().from(submissions);
  } else {
    rows = await db
      .select()
      .from(submissions)
      .where(eq(submissions.userId, session.user.id));
  }

  let updated = 0;
  const results = [];
  for (const s of rows) {
    const metrics = await fetchMetrics(s.platform, s.postUrl);
    if (metrics) {
      await db
        .update(submissions)
        .set({ views: metrics.views, engagement: metrics.engagement })
        .where(eq(submissions.id, s.id));
      updated++;
      results.push({ id: s.id, views: metrics.views, engagement: metrics.engagement });
    }
  }

  return NextResponse.json({
    ok: true,
    updated,
    scanned: rows.length,
    results,
    // Helps the UI explain when nothing changed (e.g. no key / non-YouTube).
    keyConfigured: !!process.env.YOUTUBE_API_KEY,
  });
}
