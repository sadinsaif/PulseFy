export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
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
  const email = parsed.data.email.toLowerCase().trim();
  const password = parsed.data.password;

  // Already registered?
  const existing = await db.select().from(users).where(eq(users.email, email));
  if (existing[0]) {
    // Don't reveal too much, but a clear message helps UX here.
    return NextResponse.json(
      { error: "An account with this email already exists." },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // Email verification is opt-in via env. On the free Resend tier the
  // verification email only reaches the account owner, so by default we
  // activate accounts immediately. Set REQUIRE_EMAIL_VERIFICATION="true"
  // (after verifying a sending domain) to turn the email flow back on.
  const requireVerify = process.env.REQUIRE_EMAIL_VERIFICATION === "true";

  await db.insert(users).values({
    name,
    email,
    passwordHash,
    company: name, // default company label = name; editable later
    emailVerified: requireVerify ? null : new Date(),
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
