export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { creatorPortfolio, users } from "@/db/schema";
import { portfolioSchema } from "@/lib/validation";

async function ownItem(id, sessionId) { return (await db.select({ id: creatorPortfolio.id, creatorId: creatorPortfolio.creatorId, role: users.role }).from(creatorPortfolio).innerJoin(users, eq(creatorPortfolio.creatorId, users.id)).where(and(eq(creatorPortfolio.id, id), eq(creatorPortfolio.creatorId, sessionId))))[0]; }
export async function PATCH(req, { params }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const item = await ownItem(params.id, session.user.id); if (!item || item.role !== "creator") return NextResponse.json({ error: "Portfolio item not found" }, { status: 404 });
  let body; try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const parsed = portfolioSchema.safeParse(body); if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid portfolio item" }, { status: 400 });
  const d = parsed.data; await db.update(creatorPortfolio).set({ ...d, description: d.description || null, category: d.category || null, thumbnailUrl: d.thumbnailUrl || null, platform: d.platform || null, updatedAt: new Date() }).where(eq(creatorPortfolio.id, item.id)); return NextResponse.json({ ok: true });
}
export async function DELETE(_req, { params }) { const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 }); const item = await ownItem(params.id, session.user.id); if (!item || item.role !== "creator") return NextResponse.json({ error: "Portfolio item not found" }, { status: 404 }); await db.delete(creatorPortfolio).where(eq(creatorPortfolio.id, item.id)); return NextResponse.json({ ok: true }); }
