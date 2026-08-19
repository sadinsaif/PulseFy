import crypto from "crypto";
import { db } from "@/db";
import { users } from "@/db/schema";
import { sql, eq } from "drizzle-orm";

// Provisioning helpers shared by the Privy auth bridge (auth.js). Kept separate
// from /api/register so that route stays byte-for-byte unchanged; the bridge is
// the only caller today. Everything here mirrors register's contract: usernames
// match ^[a-zA-Z0-9_.]+$ (3–30, case-insensitively unique — see lib/validation),
// and referrers are looked up by username case-insensitively.

const MAX_LEN = 30;
const MIN_LEN = 3;

// Sanitize an arbitrary seed (an email local-part, a social handle, a wallet
// suffix) into a syntactically valid username. Never throws; always returns a
// non-empty base string that satisfies the charset and the 3-char floor.
function sanitizeSeed(seed) {
  let s = String(seed || "")
    .toLowerCase()
    .replace(/[^a-z0-9_.]+/g, "_") // fold any disallowed run into a single _
    .replace(/_+/g, "_") // collapse repeats
    .replace(/\.+/g, ".")
    .replace(/^[._]+|[._]+$/g, ""); // trim leading/trailing . and _
  if (s.length > MAX_LEN) s = s.slice(0, MAX_LEN).replace(/[._]+$/g, "");
  if (s.length < MIN_LEN) s = (s + "user").slice(0, MIN_LEN + 2); // pad short/empty seeds
  return s;
}

function randomSuffix(nChars = 6) {
  return crypto.randomBytes(8).toString("hex").slice(0, nChars);
}

// Is this username already taken (case-insensitively)? Best-effort — the caller
// still wraps the INSERT in a unique-violation retry, because the DB unique
// index on lower(username) (migration 021) is the only real race-closer.
async function usernameTaken(candidate) {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.username}) = ${candidate.toLowerCase()}`);
  return Boolean(rows[0]);
}

// Produce a username that (a) is syntactically valid and (b) is free at the time
// of the check. Tries the clean base first ("maya"), then numeric variants
// ("maya_2", "maya_3", …), then a random hex suffix as a near-collision-proof
// fallback. The suffix is always kept inside the 30-char limit.
export async function generateUniqueUsername(seed) {
  const base = sanitizeSeed(seed);

  if (!(await usernameTaken(base))) return base;

  for (let n = 2; n <= 20; n++) {
    const suffix = `_${n}`;
    const candidate = base.slice(0, MAX_LEN - suffix.length) + suffix;
    if (!(await usernameTaken(candidate))) return candidate;
  }

  // Deterministic variants exhausted (a very hot base) — fall back to random.
  for (let attempt = 0; attempt < 5; attempt++) {
    const suffix = `_${randomSuffix(6)}`;
    const candidate = base.slice(0, MAX_LEN - suffix.length) + suffix;
    if (!(await usernameTaken(candidate))) return candidate;
  }

  // Last resort — a wholly random handle. The insert retry will re-roll if even
  // this collides, so correctness never depends on this being free.
  return `user_${randomSuffix(10)}`;
}

// Resolve a ?ref=<username> to the referrer's user id, case-insensitively.
// Returns null when the ref is empty, unknown, or resolves to the user
// themselves (a user can never be their own referrer). Mirrors the register
// lookup exactly so both signup paths credit referrers identically.
export async function findReferrerId(ref, selfId = null) {
  const refUsername = typeof ref === "string" ? ref.trim() : "";
  if (!refUsername) return null;
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.username}) = ${refUsername.toLowerCase()}`);
  const id = rows[0]?.id || null;
  if (id && selfId && id === selfId) return null;
  return id;
}

// Create a brand-new local user for a first-time Privy login, mirroring the
// /api/register insert contract (name, username, email, role, company,
// emailVerified, referredBy) plus the Privy columns (privyId, walletAddress).
// passwordHash stays NULL — these are passwordless accounts.
//
// A DB unique index on lower(username) (migration 021) is the real race-closer,
// so the insert is wrapped in a unique-violation retry:
//   • username clash  → regenerate the handle and retry;
//   • privy_id clash   → a concurrent login already created this identity, so
//                        return that existing row instead of failing;
//   • email clash      → another account already holds this email; bail (null)
//                        so the caller can retry and link via the verified-email
//                        path on the next attempt.
export async function createPrivyUser({ did, email, name, role, walletAddress, referrerId, seedHandle }) {
  const safeRole = role === "brand" ? "brand" : "creator";
  const cleanName = typeof name === "string" && name.trim() ? name.trim() : null;
  const base = {
    name: cleanName,
    email,
    role: safeRole,
    company: safeRole === "brand" ? cleanName : null, // brands use it as the label
    emailVerified: new Date(), // reached only with a Privy-verified email
    referredBy: referrerId || null,
    privyId: did,
    walletAddress: walletAddress || null,
  };

  for (let attempt = 0; attempt < 6; attempt++) {
    const username = await generateUniqueUsername(seedHandle || email.split("@")[0] || "user");
    try {
      const inserted = await db.insert(users).values({ ...base, username }).returning();
      return inserted[0] || null;
    } catch (err) {
      const code = err?.code || err?.cause?.code;
      const msg = `${err?.message || ""} ${err?.cause?.message || ""}`.toLowerCase();
      const isUnique = code === "23505" || /duplicate key|unique constraint/.test(msg);
      if (!isUnique) throw err;

      // Username collided with a row created since our pre-check → regenerate.
      if (/username/.test(msg)) continue;

      // privy_id (or email) collided → prefer the row that now owns our DID.
      const existing = await db.select().from(users).where(eq(users.privyId, did));
      if (existing[0]) return existing[0];

      // Email collided but the DID isn't ours: another account holds this email.
      // Bail safely — the caller returns null and a retry links via verified email.
      return null;
    }
  }
  return null;
}
