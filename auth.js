import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { loginSchema } from "@/lib/validation";
import { authConfig } from "@/auth.config";
import { getUserAccess } from "@/lib/moderation";
import { verifyPrivyAccessToken, fetchPrivyUser, extractPrivyIdentity } from "@/lib/privy-server";
import { findReferrerId, createPrivyUser } from "@/lib/provisioning";

// Auth.js only forwards a thrown error's identity to the client when it's a
// CredentialsSignin: the framework sets `?error=CredentialsSignin&code=<code>`
// on the redirect, which surfaces as `res.code` from signIn(..., {redirect:false}).
// A plain `throw new Error("…")` is masked to `?error=Configuration` with no
// code, so the client can't tell these recoverable cases from a generic failure.
// One subclass per recoverable reason; `code` is what the client branches on.
class EmailNotVerified extends CredentialsSignin {
  code = "EMAIL_NOT_VERIFIED";
}
class PrivyEmailRequired extends CredentialsSignin {
  code = "PRIVY_EMAIL_REQUIRED";
}

const nextAuth = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        // Validate shape
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        // Find user
        const rows = await db
          .select()
          .from(users)
          .where(eq(users.email, email.toLowerCase()));
        const user = rows[0];
        if (!user || !user.passwordHash) return null;

        // Check the password BEFORE the verified-state gate. Revealing
        // "email not verified" only to someone who supplied the correct
        // password means an attacker without it can't use the login form to
        // tell a registered-but-unverified address apart from a wrong one —
        // they just get "Wrong email or password." A real owner (who knows
        // their password) is still routed to the code screen to finish
        // verifying.
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        // Block unverified accounts (credentials are valid at this point).
        if (!user.emailVerified) {
          throw new EmailNotVerified();
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          company: user.company,
          role: user.role || "creator",
        };
      },
    }),
    // Privy bridge — a SECOND credentials provider (id "privy") that trades a
    // verified Privy access token for the same NextAuth session the password
    // provider mints. The browser logs in with Privy (email OTP / social /
    // external wallet), then calls signIn("privy", { token, role?, ref? }).
    // Identity is read from Privy SERVER-SIDE here; the client is never trusted
    // for it. Email/password auth above is completely untouched.
    Credentials({
      id: "privy",
      name: "Privy",
      credentials: { token: {}, role: {}, ref: {} },
      authorize: async (credentials) => {
        const token = typeof credentials?.token === "string" ? credentials.token : "";
        if (!token) return null;

        // 1. Verify the Privy access token; trust ONLY the DID from the claims.
        const claims = await verifyPrivyAccessToken(token);
        if (!claims?.user_id) return null;
        const did = claims.user_id;

        // 2. Read the user's linked accounts server-side (identity never comes
        //    from the client). No user object → treat as an auth failure.
        const privyUser = await fetchPrivyUser(did);
        if (!privyUser) return null;
        const { verifiedEmail, walletAddress, seedHandle, displayName } =
          extractPrivyIdentity(privyUser);

        // 3. Resolve the local user — DID first (the stable identity key).
        let localUser = null;
        const byDid = await db.select().from(users).where(eq(users.privyId, did));
        localUser = byDid[0] || null;

        // 3a. Known Privy user: backfill a wallet address we didn't have yet.
        if (localUser) {
          if (walletAddress && !localUser.walletAddress) {
            await db.update(users).set({ walletAddress }).where(eq(users.id, localUser.id));
            localUser.walletAddress = walletAddress;
          }
        }

        // 3b. No DID match → link to an existing row ONLY on a verified-email
        //     match. Never link on an unverified/absent email (takeover vector).
        if (!localUser && verifiedEmail) {
          const byEmail = await db.select().from(users).where(eq(users.email, verifiedEmail));
          const candidate = byEmail[0];
          if (candidate) {
            const patch = { privyId: did };
            if (walletAddress && !candidate.walletAddress) patch.walletAddress = walletAddress;
            if (!candidate.emailVerified) patch.emailVerified = new Date();
            await db.update(users).set(patch).where(eq(users.id, candidate.id));
            localUser = { ...candidate, ...patch };
          }
        }

        // 3c. Still nothing → create a fresh account. A verified email is
        //     required: email is load-bearing downstream (unique/NOT NULL, the
        //     ADMIN_EMAIL gate, notifications), so a wallet/social login with no
        //     verified email is refused with a code the client can surface.
        if (!localUser) {
          if (!verifiedEmail) throw new PrivyEmailRequired();
          const role = credentials?.role === "brand" ? "brand" : "creator";
          const referrerId = await findReferrerId(credentials?.ref);
          localUser = await createPrivyUser({
            did,
            email: verifiedEmail,
            name: displayName || seedHandle,
            role,
            walletAddress,
            referrerId,
            seedHandle,
          });
          if (!localUser) return null;
        }

        // 4. Moderation gate — never mint a session for a banned/suspended user
        //    (belt-and-suspenders with the auth() wrapper below).
        const access = await getUserAccess(localUser.id);
        if (!access.allowed) return null;

        // 5. Same shape the password provider returns, so the existing
        //    jwt/session callbacks copy id/company/role unchanged.
        return {
          id: localUser.id,
          name: localUser.name,
          email: localUser.email,
          company: localUser.company,
          role: localUser.role || "creator",
        };
      },
    }),
  ],
});

export const { handlers, signIn, signOut } = nextAuth;

// Every server-side consumer imports this wrapper, so a JWT issued before a
// suspension or ban is never trusted for protected API access.
export async function auth(...args) {
  const session = await nextAuth.auth(...args);
  if (!session?.user?.id) return session;
  const access = await getUserAccess(session.user.id);
  if (access.allowed) return session;
  return {
    ...session,
    user: { ...session.user, id: null, moderationBlocked: true, moderationMessage: access.message },
  };
}
