import { db } from "@/db";
import { verificationTokens } from "@/db/schema";
import { and, eq, lt } from "drizzle-orm";

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
    .select()
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
