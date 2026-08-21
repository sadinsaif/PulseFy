export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { reports, reportEvents, users } from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { reportCreateSchema } from "@/lib/validation";
import { isAdminEmail } from "@/lib/admin";
import { notifyAdmins } from "@/lib/notify";

const ACTIVE = ["open", "under_review", "awaiting_response"];

function isActiveDuplicateError(error) {
  let current = error;
  while (current) {
    if (current.code === "23505" && current.constraint === "reports_active_duplicate_idx") return true;
    current = current.cause;
  }
  return false;
}

// Postgres "undefined_table" — thrown until migration 010 is applied on Neon.
// Mirror the ambassador route: fail soft to an empty list instead of a 500.
function isMissingTable(err) {
  return err?.code === "42P01" || err?.cause?.code === "42P01";
}

export async function GET(req) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    if (new URL(req.url).searchParams.get("mine") === "1") {
      const rows = await db.select().from(reports).where(eq(reports.reporterId, session.user.id)).orderBy(desc(reports.createdAt));
      return NextResponse.json({ reports: rows });
    }
    if (!isAdminEmail(session.user.email)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    const rows = await db.select().from(reports).orderBy(desc(reports.createdAt)).limit(200);
    const ids = [...new Set(rows.flatMap((r) => [r.reporterId, r.reportedUserId]))];
    const people = ids.length ? await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, ids)) : [];
    const byId = new Map(people.map((p) => [p.id, p]));
    return NextResponse.json({ reports: rows.map((r) => ({ ...r, reporter: byId.get(r.reporterId), reportedUser: byId.get(r.reportedUserId) })) });
  } catch (err) {
    if (isMissingTable(err)) return NextResponse.json({ reports: [] });
    console.error("Reports list failed:", err);
    return NextResponse.json({ error: "Could not load reports." }, { status: 500 });
  }
}

export async function POST(req) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in to submit a report." }, { status: 401 });
  let body; try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const parsed = reportCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid report" }, { status: 400 });
  const d = parsed.data;
  if (d.reportedUserId === session.user.id) return NextResponse.json({ error: "You cannot report yourself." }, { status: 400 });
  const [target] = await db.select({ id: users.id, role: users.role, name: users.name }).from(users).where(eq(users.id, d.reportedUserId));
  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });
  const targetType = target.role === "brand" ? "brand" : "creator";
  if (targetType !== d.reportedUserType) return NextResponse.json({ error: "Report target does not match this profile." }, { status: 400 });
  const existing = await db.select({ id: reports.id, status: reports.status }).from(reports).where(and(eq(reports.reporterId, session.user.id), eq(reports.reportedUserId, target.id), eq(reports.reason, d.reason)));
  if (existing.some((r) => ACTIVE.includes((r.status || "open")))) return NextResponse.json({ error: "You already have an active report for this reason." }, { status: 409 });
  let created;
  try {
    [created] = await db.insert(reports).values({ reporterId: session.user.id, reporterType: session.user.role === "brand" ? "brand" : "creator", reportedUserId: target.id, reportedUserType: targetType, reason: d.reason, description: d.description, evidence: d.evidence || null }).returning();
  } catch (error) {
    if (isActiveDuplicateError(error)) return NextResponse.json({ error: "You already have an active report for this reason." }, { status: 409 });
    throw error;
  }
  await db.insert(reportEvents).values({ reportId: created.id, actorId: session.user.id, action: "submitted", note: "Report submitted" });
  await notifyAdmins({ type: "report", message: `New report ${created.id.slice(0, 8)} against ${target.name || "a user"}.`, link: "/dashboard/reports" });
  return NextResponse.json({ ok: true, reportId: created.id, message: "Report submitted for admin review." }, { status: 201 });
}
