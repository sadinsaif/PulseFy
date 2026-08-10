export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { creatorPortfolio, creatorSocialLinks, users } from "@/db/schema";
import { portfolioSchema, socialLinkSchema } from "@/lib/validation";

async function creatorSession() {
  const session = await auth();
  if (!session?.user?.id) return [null, null];
  const [user] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, session.user.id));
  return [session, user];
}
export async function GET() {
  const [session, user] = await creatorSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (user?.role !== "creator") return NextResponse.json({ error: "Creator accounts only" }, { status: 403 });
  const [items, links] = await Promise.all([db.select().from(creatorPortfolio).where(eq(creatorPortfolio.creatorId, user.id)), db.select().from(creatorSocialLinks).where(eq(creatorSocialLinks.creatorId, user.id))]);
  return NextResponse.json({ items, links });
}
export async function POST(req) {
  const [session, user] = await creatorSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (user?.role !== "creator") return NextResponse.json({ error: "Creator accounts only" }, { status: 403 });
  let body; try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  if (body.type === "social") {
    const parsed = socialLinkSchema.safeParse(body); if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid link" }, { status: 400 });
    const [link] = await db.insert(creatorSocialLinks).values({ creatorId: user.id, ...parsed.data, updatedAt: new Date() }).onConflictDoUpdate({ target: [creatorSocialLinks.creatorId, creatorSocialLinks.platform], set: { url: parsed.data.url, updatedAt: new Date() } }).returning();
    return NextResponse.json({ ok: true, link });
  }
  const parsed = portfolioSchema.safeParse(body); if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid portfolio item" }, { status: 400 });
  const d = parsed.data; const [item] = await db.insert(creatorPortfolio).values({ creatorId: user.id, ...d, description: d.description || null, category: d.category || null, thumbnailUrl: d.thumbnailUrl || null, platform: d.platform || null }).returning();
  return NextResponse.json({ ok: true, item }, { status: 201 });
}

export async function DELETE(req) {
  const [session, user] = await creatorSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (user?.role !== "creator") return NextResponse.json({ error: "Creator accounts only" }, { status: 403 });
  let body; try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const parsed = socialLinkSchema.pick({ platform: true }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid link" }, { status: 400 });
  await db.delete(creatorSocialLinks).where(and(eq(creatorSocialLinks.creatorId, user.id), eq(creatorSocialLinks.platform, parsed.data.platform)));
  return NextResponse.json({ ok: true });
}
