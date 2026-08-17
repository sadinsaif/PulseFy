export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { campaignParticipants, campaigns, users } from "@/db/schema";
import { isAdminEmail } from "@/lib/admin";

async function manager(params, session) {
  const [campaign] = await db.select({ id: campaigns.id, brandId: campaigns.brandId, visibility: campaigns.visibility, deletedAt: campaigns.deletedAt }).from(campaigns).where(eq(campaigns.id, params.id));
  if (!campaign || campaign.deletedAt || campaign.visibility !== "private" || (campaign.brandId !== session.user.id && !isAdminEmail(session.user.email))) return null;
  return campaign;
}

export async function GET(_req, { params }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const campaign = await manager(params, session);
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  const participants = await db.select({ creatorId: campaignParticipants.creatorId, status: campaignParticipants.status, createdAt: campaignParticipants.createdAt, updatedAt: campaignParticipants.updatedAt, name: users.name, username: users.username }).from(campaignParticipants).innerJoin(users, eq(campaignParticipants.creatorId, users.id)).where(eq(campaignParticipants.campaignId, campaign.id));
  return NextResponse.json({ participants });
}

export async function POST(req, { params }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  let body; try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  if (!body?.creatorId || typeof body.creatorId !== "string") return NextResponse.json({ error: "Missing creator" }, { status: 400 });
  const [[campaign], [creator]] = await Promise.all([
    db.select({ id: campaigns.id, brandId: campaigns.brandId, visibility: campaigns.visibility, deletedAt: campaigns.deletedAt }).from(campaigns).where(eq(campaigns.id, params.id)),
    db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, body.creatorId)),
  ]);
  if (!campaign || campaign.deletedAt) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (campaign.visibility !== "private") return NextResponse.json({ error: "Campaign is not private" }, { status: 409 });
  if (campaign.brandId !== session.user.id && !isAdminEmail(session.user.email)) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (!creator || creator.role !== "creator") return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  const [participant] = await db.insert(campaignParticipants).values({ campaignId: campaign.id, creatorId: creator.id, authorizedBy: session.user.id, status: "authorized", updatedAt: new Date() })
    .onConflictDoUpdate({ target: [campaignParticipants.campaignId, campaignParticipants.creatorId], set: { status: "authorized", authorizedBy: session.user.id, updatedAt: new Date() } }).returning();
  return NextResponse.json({ ok: true, participant });
}

export async function DELETE(req, { params }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const campaign = await manager(params, session);
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  let body; try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  if (!body?.creatorId || typeof body.creatorId !== "string") return NextResponse.json({ error: "Missing creator" }, { status: 400 });
  await db.update(campaignParticipants).set({ status: "revoked", updatedAt: new Date() }).where(and(eq(campaignParticipants.campaignId, campaign.id), eq(campaignParticipants.creatorId, body.creatorId)));
  return NextResponse.json({ ok: true });
}
