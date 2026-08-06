export const dynamic = "force-dynamic";
// Bounded work (batched fetches, capped rows) — give it headroom but a hard cap.
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { submissions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { extractYouTubeId, fetchYouTubeStatsByIds, canAutoFetch } from "@/lib/metrics";
import { isAdminEmail } from "@/lib/admin";

// Most YouTube rows we'll touch in one request. Batched 50/call, so this is
// ceil(MAX/50) API calls — bounds latency AND quota cost.
const MAX_ROWS = 200;

// Lightweight per-user cooldown (best-effort; per serverless instance only —
// it dampens rapid clicking / scripted spam but isn't a hard global limit).
const COOLDOWN_MS = 10_000;
const lastRefresh = new Map();

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
  // Only accept a string id; anything else is treated as "refresh all".
  const submissionId = typeof body?.submissionId === "string" ? body.submissionId : null;

  // Throttle body-less "refresh all" calls (the expensive path). A targeted
  // single-submission refresh is cheap, so we let those through.
  if (!submissionId) {
    const now = Date.now();
    const prev = lastRefresh.get(session.user.id) || 0;
    if (now - prev < COOLDOWN_MS) {
      return NextResponse.json(
        { error: "Please wait a few seconds before refreshing again." },
        { status: 429 }
      );
    }
    lastRefresh.set(session.user.id, now);
  }

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
    rows = await db.select().from(submissions).limit(MAX_ROWS);
  } else {
    rows = await db
      .select()
      .from(submissions)
      .where(eq(submissions.userId, session.user.id))
      .limit(MAX_ROWS);
  }

  // Keep only rows we can actually auto-fetch (YouTube today) and resolve to a
  // video id. Group by submission id so we update the exact row.
  const targets = [];
  for (const s of rows) {
    if (!canAutoFetch(s.platform, s.postUrl)) continue;
    const vid = extractYouTubeId(s.postUrl);
    if (vid) targets.push({ submissionId: s.id, videoId: vid });
  }

  // Batch: one API call resolves up to 50 video ids (quota cost = ceil(N/50)).
  const stats = new Map();
  const uniqueIds = [...new Set(targets.map((t) => t.videoId))];
  for (let i = 0; i < uniqueIds.length; i += 50) {
    const chunk = uniqueIds.slice(i, i + 50);
    const got = await fetchYouTubeStatsByIds(chunk);
    for (const [id, m] of got) stats.set(id, m);
  }

  // Write only rows whose metrics came back — a miss leaves numbers untouched
  // (never zeroed, never faked).
  let updated = 0;
  const results = [];
  for (const t of targets) {
    const m = stats.get(t.videoId);
    if (!m) continue;
    await db
      .update(submissions)
      .set({ views: m.views, engagement: m.engagement })
      .where(eq(submissions.id, t.submissionId));
    updated++;
    results.push({ id: t.submissionId, views: m.views, engagement: m.engagement });
  }

  return NextResponse.json({
    ok: true,
    updated,
    scanned: rows.length,
    autoFetchable: targets.length,
    results,
    // Helps the UI explain when nothing changed (e.g. no key / non-YouTube).
    keyConfigured: !!process.env.YOUTUBE_API_KEY,
  });
}
