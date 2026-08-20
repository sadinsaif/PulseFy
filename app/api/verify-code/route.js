export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyCodeSchema } from "@/lib/validation";
import { verifyCode } from "@/lib/tokens";

/**
 * POST /api/verify-code  { email, code }
 * Checks a 6-digit email-verification code. On success marks the account
 * verified so the credentials login stops throwing EMAIL_NOT_VERIFIED. Wrong
 * guesses are counted server-side (lib/tokens) and the code is burned after a
 * few, so a short code can't be brute-forced.
 */
export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = verifyCodeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }

  const email = parsed.data.email.toLowerCase().trim();
  const code = parsed.data.code.trim();

  let result;
  try {
    result = await verifyCode(email, code, "verify");
  } catch (err) {
    // Fail soft instead of throwing a raw 500. The most likely cause in
    // practice is the `attempts` column missing because migration 023 hasn't
    // been applied yet; log the real error for the operator and return a
    // generic message (mirrors resend-code's graceful handling).
    console.error("verifyCode failed:", err);
    return NextResponse.json(
      { error: "Couldn't check the code right now. Please try again." },
      { status: 500 }
    );
  }
  if (!result.ok) {
    const messages = {
      no_code: "No active code — request a new one.",
      expired: "That code has expired — request a new one.",
      too_many: "Too many attempts. Request a new code.",
      wrong:
        result.remaining > 0
          ? `Incorrect code. ${result.remaining} ${
              result.remaining === 1 ? "try" : "tries"
            } left.`
          : "Incorrect code.",
    };
    return NextResponse.json(
      { error: messages[result.reason] || "Invalid code.", reason: result.reason },
      { status: 400 }
    );
  }

  // Mark verified (idempotent — safe even if already verified).
  await db.update(users).set({ emailVerified: new Date() }).where(eq(users.email, email));

  return NextResponse.json({ ok: true, message: "Email verified — you can sign in now." });
}
