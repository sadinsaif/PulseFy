export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { forgotSchema } from "@/lib/validation";
import { createToken } from "@/lib/tokens";
import { sendResetEmail } from "@/lib/email";

const HOUR = 60 * 60 * 1000;

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = forgotSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase().trim();

  // Always respond success — never reveal whether an email is registered.
  const rows = await db.select().from(users).where(eq(users.email, email));
  const user = rows[0];

  if (user) {
    const token = await createToken(email, "reset", HOUR);
    const base =
      process.env.AUTH_URL ||
      process.env.NEXTAUTH_URL ||
      new URL(req.url).origin;
    const url = `${base}/reset?token=${token}&email=${encodeURIComponent(
      email
    )}`;
    try {
      await sendResetEmail(email, url);
    } catch (err) {
      console.error("Reset email failed:", err);
    }
  }

  return NextResponse.json({
    ok: true,
    message: "If that email is registered, a reset link is on its way.",
  });
}
