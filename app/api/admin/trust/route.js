export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { moderationEvents, users } from "@/db/schema";
import { isAdminEmail } from "@/lib/admin";
import { notifyUser } from "@/lib/notify";
import { getTrustScore } from "@/lib/trust-score";
import { verificationSchema } from "@/lib/validation";

function admin(session) { return Boolean(session?.user?.id && isAdminEmail(session.user.email)); }

export async function GET(req) {
  const session = await auth(); if (!admin(session)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const userId = new URL(req.url).searchParams.get("userId"); if (!userId) return NextResponse.json({ error: "Missing user" }, { status: 400 });
  const [user, trust] = await Promise.all([db.select({ id: users.id, name: users.name, email: users.email, role: users.role, isVerified: users.isVerified, verifiedAt: users.verifiedAt }).from(users).where(eq(users.id, userId)).then((r) => r[0]), getTrustScore(db, userId)]);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  return NextResponse.json({ user, trust });
}

export async function POST(req) {
  const session = await auth(); if (!admin(session)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  let body; try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const parsed = verificationSchema.safeParse(body); if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid verification action" }, { status: 400 });
  const d = parsed.data; if (d.targetUserId === session.user.id) return NextResponse.json({ error: "Admins cannot change their own verification." }, { status: 400 });
  let target;
  await db.transaction(async (tx) => {
    [target] = await tx.select({ id: users.id, email: users.email, role: users.role, isVerified: users.isVerified }).from(users).where(eq(users.id, d.targetUserId)).for("update");
    if (!target) { const e = new Error("User not found"); e.status = 404; throw e; }
    if (!["creator", "brand"].includes(target.role)) { const e = new Error("Only creator or brand accounts can be verified."); e.status = 400; throw e; }
    const verified = d.action === "verify";
    await tx.update(users).set({ isVerified: verified, verifiedAt: verified ? new Date() : null, verifiedBy: verified ? session.user.id : null }).where(eq(users.id, target.id));
    await tx.insert(moderationEvents).values({ targetUserId: target.id, adminId: session.user.id, action: d.action, reason: "Account verification", note: verified ? "Account verified by administrator." : "Account verification removed by administrator." });
  }).catch((e) => { throw e; });
  const verified = d.action === "verify";
  await notifyUser(target.id, { type: "verification", message: verified ? "Your PulseFy account is now verified." : "Your PulseFy account verification was removed.", link: "/dashboard/profile" });
  return NextResponse.json({ ok: true, isVerified: verified });
}
