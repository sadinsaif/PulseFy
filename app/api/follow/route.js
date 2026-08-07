export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { follows, users } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { followSchema } from "@/lib/validation";
import { notifyUser } from "@/lib/notify";

/**
 * GET /api/follow?user=<userId>
 * For the given profile: whether the signed-in user follows them, plus their
 * follower and following counts.
 *   { following: boolean, followers: number, followingCount: number }
 */
export async function GET(req) {
  const session = await auth();
  const me = session?.user?.id;
  if (!me) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const userId = new URL(req.url).searchParams.get("user");
  if (!userId) {
    return NextResponse.json({ error: "Missing user" }, { status: 400 });
  }

  // Am I following this profile?
  let following = false;
  if (userId !== me) {
    try {
      const [row] = await db
        .select({ id: follows.id })
        .from(follows)
        .where(and(eq(follows.followerId, me), eq(follows.followingId, userId)));
      following = Boolean(row);
    } catch {
      following = false;
    }
  }

  // Follower count (people who follow this profile).
  let followers = 0;
  try {
    const [row] = await db
      .select({ n: sql`count(*)` })
      .from(follows)
      .where(eq(follows.followingId, userId));
    followers = Number(row?.n || 0);
  } catch {
    followers = 0;
  }

  // Following count (people this profile follows).
  let followingCount = 0;
  try {
    const [row] = await db
      .select({ n: sql`count(*)` })
      .from(follows)
      .where(eq(follows.followerId, userId));
    followingCount = Number(row?.n || 0);
  } catch {
    followingCount = 0;
  }

  return NextResponse.json({ following, followers, followingCount });
}

/**
 * POST /api/follow  { userId }
 * Toggle: follow the user if not already following, otherwise unfollow.
 * Notifies the target only on a new follow. Returns the resulting state.
 *   { following: boolean }
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

  const parsed = followSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }

  const { userId } = parsed.data;
  if (userId === me) {
    return NextResponse.json({ error: "You can't follow yourself." }, { status: 400 });
  }

  // Target must exist.
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId));
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  // Already following? → unfollow. Otherwise → follow.
  const [existing] = await db
    .select({ id: follows.id })
    .from(follows)
    .where(and(eq(follows.followerId, me), eq(follows.followingId, userId)));

  if (existing) {
    await db.delete(follows).where(eq(follows.id, existing.id));
    return NextResponse.json({ following: false });
  }

  await db.insert(follows).values({ followerId: me, followingId: userId });

  const fromName = session.user.name || "Someone";
  await notifyUser(userId, {
    type: "follow",
    message: `${fromName} started following you.`,
    link: `/creator/${me}`,
  });

  return NextResponse.json({ following: true }, { status: 201 });
}
