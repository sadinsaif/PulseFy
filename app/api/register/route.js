export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { signupSchema } from "@/lib/validation";
import { createToken } from "@/lib/tokens";
import { sendVerificationEmail } from "@/lib/email";

const DAY = 24 * 60 * 60 * 1000;

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }

  const name = parsed.data.name.trim();
  const username = parsed.data.username.trim();
  const email = parsed.data.email.toLowerCase().trim();
  const password = parsed.data.password;
  const role = parsed.data.role === "brand" ? "brand" : "creator";

  // Already registered?
  const existing = await db.select().from(users).where(eq(users.email, email));
  if (existing[0]) {
    // Don't reveal too much, but a clear message helps UX here.
    return NextResponse.json(
      { error: "An account with this email already exists." },
      { status: 409 }
    );
  }

  // Username must be unique (case-insensitively): it's the public handle and
  // the referral lookup key (?ref=<username>), so a collision would credit the
  // wrong referrer. The DB column isn't uniquely indexed, so enforce it here.
  const usernameTaken = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.username}) = ${username.toLowerCase()}`);
  if (usernameTaken[0]) {
    return NextResponse.json(
      { error: "That username is already taken. Please choose another." },
      { status: 409 }
    );
  }

  // Referral — check if a ?ref=<username> brought them here. The signup page
  // forwards it in the request body. Look up the referrer by username
  // case-insensitively (usernames are stored with their original case). If
  // found, this new user's referredBy points to them; the referrer earns 5%
  // of this user's payouts for the first 90 days (enforced at withdrawal time).
  const refUsername = typeof body.ref === "string" ? body.ref.trim() : "";
  let referrerId = null;
  if (refUsername) {
    const referrer = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.username}) = ${refUsername.toLowerCase()}`);
    if (referrer[0]) {
      referrerId = referrer[0].id;
      // Guard: a user can never be their own referrer (defensive — at signup
      // the account doesn't exist yet, but keeps the invariant explicit).
    }
    // If username doesn't exist, silently ignore — the signup still succeeds.
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // Email verification is opt-in via env. On the free Resend tier the
  // verification email only reaches the account owner, so by default we
  // activate accounts immediately. Set REQUIRE_EMAIL_VERIFICATION="true"
  // (after verifying a sending domain) to turn the email flow back on.
  const requireVerify = process.env.REQUIRE_EMAIL_VERIFICATION === "true";

  await db.insert(users).values({
    name,
    username,
    email,
    passwordHash,
    role,
    company: role === "brand" ? name : null, // brands use it as the brand label
    emailVerified: requireVerify ? null : new Date(),
    referredBy: referrerId, // null for organic signups, referrer's id for ?ref= signups
  });

  if (!requireVerify) {
    return NextResponse.json(
      { ok: true, message: "Account created! You can sign in now." },
      { status: 201 }
    );
  }

  // Create verification token + send email
  const token = await createToken(email, "verify", DAY);
  const base =
    process.env.AUTH_URL ||
    process.env.NEXTAUTH_URL ||
    new URL(req.url).origin;
  const url = `${base}/verify?token=${token}&email=${encodeURIComponent(email)}`;

  try {
    await sendVerificationEmail(email, url);
  } catch (err) {
    // Account exists but email failed — tell the user to try res/login later.
    console.error("Verification email failed:", err);
    return NextResponse.json(
      {
        ok: true,
        warning:
          "Account created, but we couldn't send the verification email. Contact support.",
      },
      { status: 201 }
    );
  }

  return NextResponse.json(
    { ok: true, message: "Check your email to verify your account." },
    { status: 201 }
  );
}
