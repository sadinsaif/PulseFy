export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { forgotSchema } from "@/lib/validation";
import { createCode, codeCooldownRemaining } from "@/lib/tokens";
import { sendVerificationCode } from "@/lib/email";

/**
 * POST /api/resend-code  { email }
 * Emails a fresh 6-digit verification code to an existing, still-unverified
 * account. Responds the same whether or not the email is registered/verified,
 * so it never reveals account existence — except a short per-email cooldown
 * (429) to stop code-spam, which only trips for an account that already has a
 * pending code (i.e. the user is on their own verify screen).
 */
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

  const generic = NextResponse.json({
    ok: true,
    message: "If that account still needs verifying, a new code is on its way.",
  });

  // Explicit columns — safe regardless of migration state.
  const rows = await db
    .select({ id: users.id, emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.email, email));
  const user = rows[0];
  if (!user || user.emailVerified) return generic;

  // Throttle resends.
  const wait = await codeCooldownRemaining(email, "verify");
  if (wait > 0) {
    return NextResponse.json(
      {
        error: `Please wait ${Math.ceil(wait / 1000)}s before requesting another code.`,
        retryAfterMs: wait,
      },
      { status: 429 }
    );
  }

  try {
    const code = await createCode(email, "verify");
    await sendVerificationCode(email, code);
  } catch (err) {
    // Don't leak specifics; the generic response still applies.
    console.error("Resend code failed:", err);
  }

  return generic;
}
