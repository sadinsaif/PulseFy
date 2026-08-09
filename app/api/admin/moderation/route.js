export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { campaigns, moderationEvents, reports, users } from "@/db/schema";
import { isAdminEmail } from "@/lib/admin";
import { notifyUser } from "@/lib/notify";
import { moderationActionSchema } from "@/lib/validation";

function isAdmin(session) {
  return Boolean(session?.user?.id && isAdminEmail(session.user.email));
}

function invalidTransition(message, status = 409) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export async function GET(req) {
  const session = await auth();
  if (!isAdmin(session)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const userId = new URL(req.url).searchParams.get("userId");
  const query = db.select({
    id: moderationEvents.id, targetUserId: moderationEvents.targetUserId, adminId: moderationEvents.adminId,
    action: moderationEvents.action, reason: moderationEvents.reason, note: moderationEvents.note,
    previousStatus: moderationEvents.previousStatus, newStatus: moderationEvents.newStatus,
    expiresAt: moderationEvents.expiresAt, relatedReportId: moderationEvents.relatedReportId,
    relatedCampaignId: moderationEvents.relatedCampaignId, createdAt: moderationEvents.createdAt,
  }).from(moderationEvents);
  const events = userId
    ? await query.where(eq(moderationEvents.targetUserId, userId)).orderBy(desc(moderationEvents.createdAt)).limit(100)
    : await query.orderBy(desc(moderationEvents.createdAt)).limit(200);
  const adminIds = [...new Set(events.map((e) => e.adminId).filter(Boolean))];
  const admins = adminIds.length ? await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, adminIds)) : [];
  const names = new Map(admins.map((a) => [a.id, a.name || a.email]));
  return NextResponse.json({ events: events.map((e) => ({ ...e, adminName: e.adminId ? names.get(e.adminId) || "Admin" : "System" })) });
}

export async function POST(req) {
  const session = await auth();
  if (!isAdmin(session)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  let body; try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const parsed = moderationActionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid moderation action" }, { status: 400 });
  const d = parsed.data;
  if (d.targetUserId === session.user.id) return NextResponse.json({ error: "Admins cannot moderate themselves." }, { status: 400 });
  const [target] = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role, moderationStatus: users.moderationStatus })
    .from(users).where(eq(users.id, d.targetUserId));
  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });
  if (isAdminEmail(target.email)) return NextResponse.json({ error: "Admin accounts cannot be moderated here." }, { status: 400 });
  if (d.relatedReportId) {
    const [report] = await db.select({ id: reports.id, reportedUserId: reports.reportedUserId }).from(reports).where(eq(reports.id, d.relatedReportId));
    if (!report || report.reportedUserId !== target.id) return NextResponse.json({ error: "Related report must concern this user." }, { status: 400 });
  }
  if (d.relatedCampaignId) {
    const [campaign] = await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.id, d.relatedCampaignId));
    if (!campaign) return NextResponse.json({ error: "Related campaign not found." }, { status: 404 });
  }
  const now = new Date();
  const expiresAt = d.action === "suspension" ? new Date(now.getTime() + d.durationHours * 60 * 60 * 1000) : null;
  let nextStatus;
  try {
    await db.transaction(async (tx) => {
      // Lock and re-read inside the transaction: the client and preflight read
      // must never decide an account's current moderation state.
      const [current] = await tx.select({ id: users.id, email: users.email, moderationStatus: users.moderationStatus })
        .from(users).where(eq(users.id, d.targetUserId)).for("update");
      if (!current) throw invalidTransition("User not found.", 404);
      if (isAdminEmail(current.email)) throw invalidTransition("Admin accounts cannot be moderated here.", 400);
      const previousStatus = current.moderationStatus || "active";

      if (previousStatus === "banned") {
        if (d.action === "warning" || d.action === "suspension") {
          throw invalidTransition("A banned user can only be restored through Unban.", 409);
        }
        nextStatus = d.action === "unban" ? "active" : "banned";
      } else if (previousStatus === "suspended") {
        if (d.action === "warning" || d.action === "suspension") {
          throw invalidTransition("A suspended user cannot be warned or re-suspended. Ban them or allow the suspension to expire.", 409);
        }
        if (d.action === "unban") throw invalidTransition("Only banned users can be unbanned.", 400);
        nextStatus = d.action === "ban" ? "banned" : "suspended";
      } else {
        if (d.action === "unban") throw invalidTransition("Only banned users can be unbanned.", 400);
        nextStatus = d.action === "warning" ? "warned" : d.action === "suspension" ? "suspended" : d.action === "ban" ? "banned" : previousStatus;
      }

      if (d.action !== "moderation_note") {
        const patch = { moderationStatus: nextStatus };
        if (d.action === "suspension") Object.assign(patch, { suspendedUntil: expiresAt, suspensionReason: d.reason, banReason: null, bannedAt: null, bannedBy: null });
        if (d.action === "ban") Object.assign(patch, { suspendedUntil: null, suspensionReason: null, banReason: d.reason, bannedAt: now, bannedBy: session.user.id });
        if (d.action === "unban") Object.assign(patch, { suspendedUntil: null, suspensionReason: null, banReason: null, bannedAt: null, bannedBy: null });
        await tx.update(users).set(patch).where(eq(users.id, current.id));
      }
      await tx.insert(moderationEvents).values({
        targetUserId: current.id, adminId: session.user.id, action: d.action,
        reason: d.reason, note: d.note, previousStatus, newStatus: nextStatus,
        expiresAt, relatedReportId: d.relatedReportId || null, relatedCampaignId: d.relatedCampaignId || null,
      });
    });
  } catch (error) {
    if (error.status) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }

  const labels = { warning: "warning", suspension: "suspension", ban: "ban", unban: "account restoration", moderation_note: "moderation update" };
  if (d.action !== "moderation_note") {
    const duration = expiresAt ? ` It expires ${expiresAt.toLocaleString()}.` : "";
    await notifyUser(target.id, { type: "moderation", message: `PulseFy account ${labels[d.action]}: ${d.reason}.${duration}`, link: "/dashboard" });
  }
  return NextResponse.json({ ok: true, status: nextStatus, expiresAt });
}
