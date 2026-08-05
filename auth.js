import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { loginSchema } from "@/lib/validation";
import { authConfig } from "@/auth.config";

export const { handlers, signIn, signOut, auth } = NextAuth({
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

        // Block unverified accounts
        if (!user.emailVerified) {
          throw new Error("EMAIL_NOT_VERIFIED");
        }

        // Check password
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          company: user.company,
          role: user.role || "creator",
        };
      },
    }),
  ],
});
