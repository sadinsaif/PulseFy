export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { messages, users } from "@/db/schema";
import { and, asc, eq, ne, or, sql } from "drizzle-orm";
import { messageSchema } from "@/lib/validation";
import { notifyUser } from "@/lib/notify";

/**
 * GET /api/messages
 *   (no params)      → conversation list: every user you've messaged with,
 *                      their latest message + unread count, newest first.
 *   ?with=<userId>   → the full thread with that user (oldest→newest) plus the
 *                      partner's basic profile; also marks their messages read.
 *   ?count=1         → just your total unread message count (for the badge).
 */
export async function GET(req) {
  const session = await auth();
  const me = session?.user?.id;
  if (!me) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const params = new URL(req.url).searchParams;

  // ── Badge: total unread across all conversations ────────────────────────
  if (params.get("count")) {
    let unread = 0;
    try {
      const [row] = await db
        .select({ n: sql`count(*)` })
        .from(messages)
        .where(and(eq(messages.recipientId, me), eq(messages.read, "no")));
      unread = Number(row?.n || 0);
    } catch {
      unread = 0;
    }
    return NextResponse.json({ unread });
  }

  const withId = params.get("with");

  // ── A single conversation thread ────────────────────────────────────────
  if (withId) {
    if (withId === me) {
      return NextResponse.json({ error: "You can't message yourself." }, { status: 400 });
    }

    let partner = null;
    try {
      const [p] = await db
        .select({
          id: users.id,
          name: users.name,
          username: users.username,
          image: users.image,
        })
        .from(users)
        .where(eq(users.id, withId));
      partner = p || null;
    } catch {
      partner = null;
    }
    if (!partner) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    let thread = [];
    try {
      thread = await db
        .select({
          id: messages.id,
          senderId: messages.senderId,
          recipientId: messages.recipientId,
          body: messages.body,
          read: messages.read,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(
          or(
            and(eq(messages.senderId, me), eq(messages.recipientId, withId)),
            and(eq(messages.senderId, withId), eq(messages.recipientId, me))
          )
        )
        .orderBy(asc(messages.createdAt));
    } catch {
      thread = [];
    }

    // Opening the thread marks the partner's messages to me as read.
    try {
      await db
        .update(messages)
        .set({ read: "yes" })
        .where(
          and(
            eq(messages.recipientId, me),
            eq(messages.senderId, withId),
            eq(messages.read, "no")
          )
        );
    } catch {
      /* non-fatal */
    }

    return NextResponse.json({ partner, messages: thread });
  }

  // ── Conversation list (latest message per partner) ──────────────────────
  let conversations = [];
  try {
    const { rows } = await db.execute(sql`
      SELECT
        m.partner AS "partnerId",
        u.name AS "name",
        u.username AS "username",
        u.image AS "image",
        m.body AS "lastBody",
        m.sender_id AS "lastSender",
        m.created_at AS "lastAt",
        (
          SELECT count(*) FROM messages mm
          WHERE mm.recipient_id = ${me}
            AND mm.sender_id = m.partner
            AND mm.read = 'no'
        ) AS "unread"
      FROM (
        SELECT
          CASE WHEN sender_id = ${me} THEN recipient_id ELSE sender_id END AS partner,
          body, sender_id, created_at,
          row_number() OVER (
            PARTITION BY CASE WHEN sender_id = ${me} THEN recipient_id ELSE sender_id END
            ORDER BY created_at DESC
          ) AS rn
        FROM messages
        WHERE sender_id = ${me} OR recipient_id = ${me}
      ) m
      JOIN users u ON u.id = m.partner
      WHERE m.rn = 1
      ORDER BY m.created_at DESC
      LIMIT 50
    `);
    conversations = (rows || []).map((r) => ({
      partnerId: r.partnerId,
      name: r.name,
      username: r.username,
      image: r.image,
      lastBody: r.lastBody,
      lastSender: r.lastSender,
      lastAt: r.lastAt,
      unread: Number(r.unread || 0),
    }));
  } catch {
    conversations = [];
  }

  return NextResponse.json({ conversations });
}

/**
 * POST /api/messages  { to, body }
 * Send a direct message to another user, then notify them.
 */
export async function POST(req) {
  const session = await auth();
  const me = session?.user?.id;
  if (!me) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let raw;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = messageSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }

  const { to, body } = parsed.data;
  if (to === me) {
    return NextResponse.json({ error: "You can't message yourself." }, { status: 400 });
  }

  // Recipient must exist.
  const [recipient] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, to), ne(users.id, me)));
  if (!recipient) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const [inserted] = await db
    .insert(messages)
    .values({ senderId: me, recipientId: to, body })
    .returning({
      id: messages.id,
      senderId: messages.senderId,
      recipientId: messages.recipientId,
      body: messages.body,
      read: messages.read,
      createdAt: messages.createdAt,
    });

  const fromName = session.user.name || "Someone";
  await notifyUser(to, {
    type: "message",
    message: `${fromName} sent you a message.`,
    link: `/dashboard/inbox?to=${me}`,
  });

  return NextResponse.json({ ok: true, message: inserted }, { status: 201 });
}
