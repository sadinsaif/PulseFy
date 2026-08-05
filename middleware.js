import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Edge-safe: uses only authConfig (no bcrypt / db imports).
// The `authorized` callback in auth.config.js gates /dashboard, /challenge, /creator.
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Run on everything except Next internals, static assets, and the auth API.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
