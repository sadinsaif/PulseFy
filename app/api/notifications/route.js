export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";

/** GET /api/notifications — the signed-in user's notifications (newest first). */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, session.user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(30);

  const unread = rows.filter((r) => r.read !== "yes").length;
  return NextResponse.json({ notifications: rows, unread });
}

/**
 * POST /api/notifications — mark as read.
 * Body: { id } to mark one, or { all: true } to mark all.
 */
export async function POST(req) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }

  if (body.all) {
    await db
      .update(notifications)
      .set({ read: "yes" })
      .where(eq(notifications.userId, session.user.id));
  } else if (body.id) {
    await db
      .update(notifications)
      .set({ read: "yes" })
      .where(
        and(
          eq(notifications.id, body.id),
          eq(notifications.userId, session.user.id)
        )
      );
  }

  return NextResponse.json({ ok: true });
}
