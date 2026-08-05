/**
 * Edge-safe auth config (no database or bcrypt imports).
 * Shared by both the middleware (Edge runtime) and the full Node config in auth.js.
 */
const PROTECTED = ["/dashboard", "/challenge", "/creator"];

export const authConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [], // real provider added in auth.js (Node runtime)
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const loggedIn = !!auth?.user;
      const isProtected = PROTECTED.some((p) => nextUrl.pathname.startsWith(p));
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
