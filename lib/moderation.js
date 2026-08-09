import { and, desc, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { moderationEvents, users } from "@/db/schema";
import { notifyUser } from "@/lib/notify";

export async function getUserAccess(userId) {
  const [user] = await db.select({
    id: users.id,
    moderationStatus: users.moderationStatus,
    suspendedUntil: users.suspendedUntil,
    suspensionReason: users.suspensionReason,
    banReason: users.banReason,
  }).from(users).where(eq(users.id, userId));
  if (!user) return { allowed: false, message: "Your account is unavailable." };

  if (user.moderationStatus === "suspended" && user.suspendedUntil && user.suspendedUntil <= new Date()) {
    const [warning] = await db.select({ id: moderationEvents.id })
      .from(moderationEvents)
      .where(and(eq(moderationEvents.targetUserId, user.id), eq(moderationEvents.action, "warning")))
      .limit(1);
    const restoredStatus = warning ? "warned" : "active";
    let restored = false;
    await db.transaction(async (tx) => {
      const changed = await tx.update(users)
        .set({ moderationStatus: restoredStatus, suspendedUntil: null, suspensionReason: null })
        .where(and(eq(users.id, user.id), eq(users.moderationStatus, "suspended"), lte(users.suspendedUntil, new Date())))
        .returning({ id: users.id });
      if (changed.length) {
        restored = true;
        await tx.insert(moderationEvents).values({
          targetUserId: user.id,
          action: "suspension_expired",
          previousStatus: "suspended",
          newStatus: restoredStatus,
          expiresAt: user.suspendedUntil,
          note: "Temporary suspension expired automatically.",
        });
      }
    });
    if (restored) await notifyUser(user.id, { type: "moderation", message: "Your temporary suspension has expired. Your account is active again.", link: "/dashboard" });
    return { allowed: true, status: restoredStatus };
  }
  if (user.moderationStatus === "banned") return { allowed: false, status: "banned", message: `Your account has been banned.${user.banReason ? ` Reason: ${user.banReason}` : ""}` };
  if (user.moderationStatus === "suspended") return { allowed: false, status: "suspended", message: `Your account is suspended until ${new Date(user.suspendedUntil).toLocaleString()}.${user.suspensionReason ? ` Reason: ${user.suspensionReason}` : ""}` };
  return { allowed: true, status: user.moderationStatus || "active" };
}

export async function listModerationHistory(userId) {
  return db.select().from(moderationEvents)
    .where(eq(moderationEvents.targetUserId, userId))
    .orderBy(desc(moderationEvents.createdAt));
}
