import { db } from "@/db";
import { notifications, users } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { getAdminEmails } from "@/lib/admin";

/** Create one notification row for a single user. */
export async function notifyUser(userId, { type, message, link }) {
  if (!userId) return;
  try {
    await db.insert(notifications).values({ userId, type, message, link: link || null });
  } catch (err) {
    console.error("notifyUser failed:", err);
  }
}

/** Notify every configured admin (looked up by their email). */
export async function notifyAdmins({ type, message, link }) {
  const emails = getAdminEmails();
  if (!emails.length) return;
  try {
    const admins = await db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.email, emails));
    for (const a of admins) {
      await notifyUser(a.id, { type, message, link });
    }
  } catch (err) {
    console.error("notifyAdmins failed:", err);
  }
}
