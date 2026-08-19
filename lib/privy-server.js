// Server-only Privy bridge helpers. Imported ONLY from Node-runtime code — the
// Privy Credentials provider in auth.js and the /api/privy/wallet backfill route.
// It must NEVER be imported from the Edge bundle (auth.config.js / middleware.js):
// @privy-io/node is a Node SDK and PRIVY_APP_SECRET must never reach the client.
//
// The bridge pattern: the browser authenticates with Privy, we verify the Privy
// access token here, read the user's linked accounts server-side (identity is
// NEVER trusted from the client), and hand a resolved local user to NextAuth so
// a normal JWT session is minted. Every existing guard — middleware route-gating,
// the auth() moderation wrapper, roles, referrals, withdrawals — keeps working
// unchanged, and email/password users are untouched.

import { PrivyClient } from "@privy-io/node";

let _client = null;

// One cached PrivyClient per process. Returns null when Privy isn't configured
// (e.g. local dev with no env), so callers can cleanly no-op.
function getPrivyClient() {
  if (_client) return _client;
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) return null;
  _client = new PrivyClient({
    appId,
    appSecret,
    // Optional: skip a per-verification JWKS network fetch when the app's
    // verification key is supplied. Falls back to JWKS lookup when absent.
    ...(process.env.PRIVY_VERIFICATION_KEY
      ? { jwtVerificationKey: process.env.PRIVY_VERIFICATION_KEY }
      : {}),
  });
  return _client;
}

// Whether the Privy bridge is wired at all. Used to guard optional code paths.
export function isPrivyConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID && process.env.PRIVY_APP_SECRET);
}

// Verify a Privy access token STRING and return its claims, or null on any
// failure. verifyAccessToken already checks signature/expiry/app-scope; we add
// explicit issuer + app_id assertions as defence in depth. Never throws.
// Claims are snake_case: { user_id (Privy DID), app_id, issuer, issued_at,
// expiration, session_id }.
export async function verifyPrivyAccessToken(token) {
  const privy = getPrivyClient();
  if (!privy || typeof token !== "string" || !token) return null;
  try {
    const claims = await privy.utils().auth().verifyAccessToken(token);
    if (!claims || typeof claims.user_id !== "string" || !claims.user_id) return null;
    if (claims.app_id !== process.env.NEXT_PUBLIC_PRIVY_APP_ID) return null;
    if (claims.issuer !== "privy.io") return null;
    return claims;
  } catch {
    return null;
  }
}

// Fetch the full Privy user by DID (linked accounts live here, not in the
// token). Returns null on failure. Never throws.
export async function fetchPrivyUser(did) {
  const privy = getPrivyClient();
  if (!privy || typeof did !== "string" || !did) return null;
  try {
    return await privy.users()._get(did);
  } catch {
    return null;
  }
}

// Derive the identity fields we persist from a Privy User's linked_accounts.
// Pure/synchronous — no network, never throws.
export function extractPrivyIdentity(user) {
  const accounts = Array.isArray(user?.linked_accounts) ? user.linked_accounts : [];

  // --- Verified email: the ONLY signal we ever auto-link an existing row on.
  //   (1) a dedicated email account Privy OTP-verified (proves inbox control), or
  //   (2) a Google OAuth account (Google asserts a verified email).
  // Apple/Discord/GitHub/X emails are deliberately EXCLUDED from linking — those
  // can be unverified or relay addresses, which would turn email-string linking
  // into an account-takeover vector.
  let verifiedEmail = null;
  const emailAcct = accounts.find(
    (a) => a && a.type === "email" && a.verified_at && a.address
  );
  if (emailAcct) {
    verifiedEmail = String(emailAcct.address).trim().toLowerCase();
  } else {
    const google = accounts.find(
      (a) => a && a.type === "google_oauth" && a.verified_at && a.email
    );
    if (google) verifiedEmail = String(google.email).trim().toLowerCase();
  }
  if (!verifiedEmail) verifiedEmail = null;

  // --- Embedded USDC-on-Base wallet: a Privy-managed Ethereum wallet. The 0x
  // address is EVM-chain-agnostic, so the same value is the user's Base address.
  const embedded = accounts.find(
    (a) =>
      a &&
      a.type === "wallet" &&
      a.wallet_client_type === "privy" &&
      a.chain_type === "ethereum" &&
      a.address
  );
  const walletAddress = embedded ? String(embedded.address).trim() : null;

  // --- Username seed: email local-part → a social handle → wallet suffix.
  let seedHandle = "";
  if (verifiedEmail) seedHandle = verifiedEmail.split("@")[0] || "";
  if (!seedHandle) {
    const handled = accounts.find((a) => a && typeof a.username === "string" && a.username);
    if (handled) seedHandle = handled.username;
  }
  if (!seedHandle && walletAddress) seedHandle = `user_${walletAddress.slice(-8)}`;
  if (!seedHandle) seedHandle = "user";

  // --- Best-effort human display name for the `name` column.
  let displayName = null;
  const named = accounts.find((a) => a && typeof a.name === "string" && a.name);
  if (named) displayName = String(named.name).trim() || null;

  return { verifiedEmail, walletAddress, seedHandle, displayName };
}
