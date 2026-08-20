import { db } from "@/db";
import { verificationTokens } from "@/db/schema";
import { and, eq, gt, lt, sql } from "drizzle-orm";

/**
 * Create a single-use token for a given email + purpose ("verify" | "reset").
 * Returns the raw token string to embed in the email link.
 */
export async function createToken(email, purpose, ttlMs) {
  const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
  const expires = new Date(Date.now() + ttlMs);

  // Clear any prior tokens of this purpose for the email.
  await db
    .delete(verificationTokens)
    .where(
      and(
        eq(verificationTokens.identifier, email),
        eq(verificationTokens.purpose, purpose)
      )
    );

  await db.insert(verificationTokens).values({
    identifier: email,
    token,
    purpose,
    expires,
  });

  return token;
}

/**
 * Look up a token; returns the row if valid + unexpired, else null.
 * Does NOT consume it — call consumeToken() after the action succeeds.
 */
export async function findToken(email, token, purpose) {
  const rows = await db
    .select({
      identifier: verificationTokens.identifier,
      token: verificationTokens.token,
      purpose: verificationTokens.purpose,
      expires: verificationTokens.expires,
    })
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.identifier, email),
        eq(verificationTokens.token, token),
        eq(verificationTokens.purpose, purpose)
      )
    );

  const row = rows[0];
  if (!row) return null;
  if (row.expires < new Date()) return null;
  return row;
}

export async function consumeToken(email, token) {
  await db
    .delete(verificationTokens)
    .where(
      and(
        eq(verificationTokens.identifier, email),
        eq(verificationTokens.token, token)
      )
    );
}

/** Housekeeping: drop expired tokens. */
export async function purgeExpired() {
  await db
    .delete(verificationTokens)
    .where(lt(verificationTokens.expires, new Date()));
}

// ─────────────────────────────────────────────────────────────────────────────
// 6-digit email-verification CODES (the signup OTP flow).
// These reuse the verification_tokens table: the `token` column stores the
// 6-digit code and `attempts` (migration 023) counts wrong guesses so a short
// code can't be brute-forced. Codes are short-lived and single-use. Only the
// "verify" purpose uses codes; "reset" stays a long emailed link (createToken).
// ─────────────────────────────────────────────────────────────────────────────

const CODE_TTL_MS = 10 * 60 * 1000; // codes expire in 10 minutes
const MAX_ATTEMPTS = 5; // wrong guesses before a code is burned
const RESEND_COOLDOWN_MS = 60 * 1000; // min gap between resends per email

/** Cryptographically-random 6-digit string ("000000"–"999999"). */
function sixDigitCode() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1_000_000).padStart(6, "0");
}

/**
 * Create + store a fresh 6-digit code for email + purpose, replacing any prior
 * token of that purpose. Returns the raw code to email.
 */
export async function createCode(email, purpose = "verify") {
  const code = sixDigitCode();
  const expires = new Date(Date.now() + CODE_TTL_MS);

  await db
    .delete(verificationTokens)
    .where(
      and(
        eq(verificationTokens.identifier, email),
        eq(verificationTokens.purpose, purpose)
      )
    );

  await db.insert(verificationTokens).values({
    identifier: email,
    token: code,
    purpose,
    expires,
    attempts: 0,
  });

  return code;
}

/**
 * ms until another code may be requested for email + purpose, or 0 if one can
 * be sent now. Derived from the stored code's issue time (expires − CODE_TTL_MS)
 * so no extra column is needed.
 */
export async function codeCooldownRemaining(email, purpose = "verify") {
  const rows = await db
    .select({ expires: verificationTokens.expires })
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.identifier, email),
        eq(verificationTokens.purpose, purpose)
      )
    );
  const row = rows[0];
  if (!row) return 0;
  const createdAt = row.expires.getTime() - CODE_TTL_MS;
  const elapsed = Date.now() - createdAt;
  return elapsed >= RESEND_COOLDOWN_MS ? 0 : RESEND_COOLDOWN_MS - elapsed;
}

/** Delete the pending token(s) for email + purpose. */
async function consumeCode(email, purpose) {
  await db
    .delete(verificationTokens)
    .where(
      and(
        eq(verificationTokens.identifier, email),
        eq(verificationTokens.purpose, purpose)
      )
    );
}

/**
 * Public wrapper to drop a pending code — used to roll one back when the
 * create succeeded but the send failed, so the resend cooldown isn't left
 * armed against a code the user never received.
 */
export async function deleteCode(email, purpose = "verify") {
  await consumeCode(email, purpose);
}

/**
 * Check a submitted 6-digit code. On success burns the code and returns
 * { ok: true }. Otherwise returns { ok: false, reason, remaining } where
 * reason ∈ "no_code" | "expired" | "wrong" | "too_many" and `remaining` is the
 * tries left after this attempt (meaningful only for "wrong").
 *
 * The attempt is claimed with a single conditional UPDATE that increments
 * `attempts` only while the code is unexpired and still under MAX_ATTEMPTS.
 * Doing the check-and-increment as one atomic statement (rather than read →
 * compare → update) closes the TOCTOU window where concurrent guesses could
 * each pass a stale `attempts` read and blow past the ceiling — Postgres
 * serializes the UPDATEs on the row, so at most MAX_ATTEMPTS of them ever match.
 */
export async function verifyCode(email, code, purpose = "verify") {
  const now = new Date();

  // Atomically claim one guess slot. Returns the row only if a slot was free.
  const claimed = await db
    .update(verificationTokens)
    .set({ attempts: sql`${verificationTokens.attempts} + 1` })
    .where(
      and(
        eq(verificationTokens.identifier, email),
        eq(verificationTokens.purpose, purpose),
        lt(verificationTokens.attempts, MAX_ATTEMPTS),
        gt(verificationTokens.expires, now)
      )
    )
    .returning({
      token: verificationTokens.token,
      attempts: verificationTokens.attempts,
    });

  const row = claimed[0];
  if (!row) {
    // No slot claimed — figure out why so the message is useful, and burn any
    // dead/maxed code so a fresh one can be issued.
    const existing = await db
      .select({
        expires: verificationTokens.expires,
        attempts: verificationTokens.attempts,
      })
      .from(verificationTokens)
      .where(
        and(
          eq(verificationTokens.identifier, email),
          eq(verificationTokens.purpose, purpose)
        )
      );
    const e = existing[0];
    if (!e) return { ok: false, reason: "no_code" };
    if (e.expires < now) {
      await consumeCode(email, purpose);
      return { ok: false, reason: "expired" };
    }
    // attempts already at the ceiling
    await consumeCode(email, purpose);
    return { ok: false, reason: "too_many" };
  }

  // A slot was claimed; `row.attempts` is the post-increment count.
  if (row.token !== code) {
    const remaining = Math.max(0, MAX_ATTEMPTS - row.attempts);
    if (remaining === 0) {
      // This wrong guess used the last slot — burn the code.
      await consumeCode(email, purpose);
      return { ok: false, reason: "too_many", remaining: 0 };
    }
    return { ok: false, reason: "wrong", remaining };
  }

  // Correct — single-use: burn it.
  await consumeCode(email, purpose);
  return { ok: true };
}
