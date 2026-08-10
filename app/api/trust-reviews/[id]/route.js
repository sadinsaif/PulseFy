export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { moderationEvents, reviews } from "@/db/schema";
import { isAdminEmail } from "@/lib/admin";
import { notifyUser } from "@/lib/notify";
import { reviewModerationSchema } from "@/lib/validation";

export async function PATCH(req, { params }) {
  const session = await auth();
  if (!session?.user?.id || !isAdminEmail(session.user.email)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  let body; try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const parsed = reviewModerationSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid moderation action" }, { status: 400 });
  const d = parsed.data;
  const status = d.action === "hide" ? "hidden" : "visible";
  let review;
  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(reviews).where(eq(reviews.id, params.id)).for("update");
    if (!current) { const err = new Error("Review not found"); err.status = 404; throw err; }
    [review] = await tx.update(reviews).set({ status, moderatedBy: session.user.id, moderationNote: d.note, updatedAt: new Date() }).where(eq(reviews.id, current.id)).returning();
    await tx.insert(moderationEvents).values({ targetUserId: current.reviewerId, adminId: session.user.id, action: `review_${d.action}`, reason: "Review moderation", note: d.note, relatedCampaignId: current.campaignId });
  }).catch((error) => { throw error; });
  await notifyUser(review.reviewerId, { type: "trust_review", message: "Your PulseFy review was moderated.", link: "/dashboard/profile" });
  return NextResponse.json({ ok: true, status });
}
