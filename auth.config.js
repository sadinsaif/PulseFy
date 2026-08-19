/**
 * Edge-safe auth config (no database or bcrypt imports).
 * Shared by both the middleware (Edge runtime) and the full Node config in auth.js.
 */
const PROTECTED = ["/dashboard", "/challenge", "/creator"];

// Individual creator profiles (/creator/<id>) are PUBLIC — a shared profile link
// must open for logged-out visitors. Only the single-segment profile route is
// exempted from the login gate: the bare /creator prefix stays protected, and so
// would any future sub-page like /creator/<id>/edit.
const PUBLIC_EXCEPTIONS = [/^\/creator\/[^/]+\/?$/];

export const authConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [], // real provider added in auth.js (Node runtime)
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const loggedIn = !!auth?.user;
      const path = nextUrl.pathname;
      if (PUBLIC_EXCEPTIONS.some((re) => re.test(path))) return true;
      const isProtected = PROTECTED.some((p) => path.startsWith(p));
      if (isProtected && !loggedIn) return false; // → redirect to signIn page
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.company = user.company;
        token.role = user.role || "creator";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.company = token.company;
        session.user.role = token.role || "creator";
      }
      return session;
    },
  },
};
