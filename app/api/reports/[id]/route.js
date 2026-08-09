export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { moderationEvents, reports, reportEvents, users } from "@/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { reportResponseSchema, reportUpdateSchema } from "@/lib/validation";
import { getAdminEmails, isAdminEmail } from "@/lib/admin";
import { notifyAdmins, notifyUser } from "@/lib/notify";

async function admin(session) { return Boolean(session?.user?.id && isAdminEmail(session.user.email)); }
export async function GET(_req, { params }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const [report] = await db.select().from(reports).where(eq(reports.id, params.id));
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  const isAdmin = await admin(session);
  if (!isAdmin && report.reporterId !== session.user.id) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const people = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role, moderationStatus: users.moderationStatus, suspendedUntil: users.suspendedUntil }).from(users).where(inArray(users.id, [report.reporterId, report.reportedUserId, report.assignedAdminId, report.resolvedBy].filter(Boolean)));
  const byId = new Map(people.map((p) => [p.id, p]));
  const events = await db.select().from(reportEvents).where(eq(reportEvents.reportId, report.id)).orderBy(desc(reportEvents.createdAt));
  const prior = await db.select({ id: reports.id, reason: reports.reason, status: reports.status, createdAt: reports.createdAt }).from(reports).where(eq(reports.reportedUserId, report.reportedUserId)).orderBy(desc(reports.createdAt)).limit(10);
  if (!isAdmin) {
    const reportedUser = byId.get(report.reportedUserId);
    return NextResponse.json({
      report,
      reportedUser: reportedUser && { id: reportedUser.id, name: reportedUser.name, role: reportedUser.role },
      events,
    });
  }
  return NextResponse.json({ report, reporter: byId.get(report.reporterId), reportedUser: byId.get(report.reportedUserId), assignedAdmin: byId.get(report.assignedAdminId), events, priorReports: prior });
}
export async function POST(req, { params }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const [report] = await db.select().from(reports).where(eq(reports.id, params.id));
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  if (report.reporterId !== session.user.id) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (report.status !== "awaiting_response") return NextResponse.json({ error: "This report is not awaiting more information." }, { status: 400 });
  let body; try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const parsed = reportResponseSchema.safeParse(body); if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid response" }, { status: 400 });
  const d = parsed.data; const note = `${d.message}${d.evidence ? `\nEvidence: ${d.evidence}` : ""}`;
  await db.transaction(async (tx) => {
    await tx.insert(reportEvents).values({ reportId: report.id, actorId: session.user.id, action: "reporter_response", note });
    await tx.update(reports).set({ status: "under_review", updatedAt: new Date() }).where(eq(reports.id, report.id));
  });
  if (report.assignedAdminId) await notifyUser(report.assignedAdminId, { type: "report", message: `New information was added to report ${report.id.slice(0, 8)}.`, link: `/dashboard/reports` });
  else await notifyAdmins({ type: "report", message: `New information was added to report ${report.id.slice(0, 8)}.`, link: "/dashboard/reports" });
  return NextResponse.json({ ok: true, message: "Additional information sent to the review team." });
}
export async function PATCH(req, { params }) {
  const session = await auth(); if (!(await admin(session))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  let body; try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const parsed = reportUpdateSchema.safeParse(body); if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid update" }, { status: 400 });
  const [report] = await db.select().from(reports).where(eq(reports.id, params.id)); if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  const d = parsed.data; const patch = { updatedAt: new Date() }; let event = d.action;
  if (d.priority) patch.priority = d.priority;
  if (d.action === "assign") { const assignee = d.assignedAdminId || session.user.id; const [u] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, assignee)); if (!u || !getAdminEmails().includes(u.email.toLowerCase())) return NextResponse.json({ error: "Assignee must be an admin." }, { status: 400 }); patch.assignedAdminId = assignee; }
  if (d.action === "status") {
    if (!d.status) return NextResponse.json({ error: "Choose a status." }, { status: 400 });
    if (d.status === "awaiting_response") return NextResponse.json({ error: "Use Request More Information to request a reporter response." }, { status: 400 });
    patch.status = d.status;
  }
  if (d.action === "priority" && !d.priority) return NextResponse.json({ error: "Choose a priority." }, { status: 400 });
  if (d.action === "request_info") { patch.status = "awaiting_response"; }
  if (d.action === "resolve" || d.action === "dismiss") { if (!d.resolution || !d.resolutionNote) return NextResponse.json({ error: "Resolution type and note are required." }, { status: 400 }); patch.status = d.action === "resolve" ? "resolved" : "dismissed"; patch.resolution = d.resolution; patch.resolutionNote = d.resolutionNote; patch.resolvedBy = session.user.id; patch.resolvedAt = new Date(); }
  await db.transaction(async (tx) => {
    await tx.update(reports).set(patch).where(eq(reports.id, report.id));
    await tx.insert(reportEvents).values({ reportId: report.id, actorId: session.user.id, action: event, note: d.resolutionNote || d.status || d.priority || null });
    await tx.insert(moderationEvents).values({ targetUserId: report.reportedUserId, adminId: session.user.id, action: `report_${event}`, note: d.resolutionNote || d.status || d.priority || null, relatedReportId: report.id });
  });
  if (["resolve", "dismiss", "request_info"].includes(d.action)) await notifyUser(report.reporterId, { type: "report", message: d.action === "request_info" ? "An admin requested more information about your report." : `Your report has been ${d.action === "resolve" ? "resolved" : "dismissed"}.`, link: "/dashboard/reports" });
  return NextResponse.json({ ok: true });
}
