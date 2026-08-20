"use client";

import { signOut } from "next-auth/react";

/**
 * Sign-out button — clears the NextAuth session. Wallet/social login (Privy)
 * was removed from the UI, so there's no second (Privy) session to clear.
 * Drop-in for the old inline `signOut({ callbackUrl })` buttons — accepts
 * className/style/children.
 */
export default function SignOutButton({ className, style, children = "Sign out", callbackUrl = "/" }) {
  return (
    <button type="button" className={className} style={style} onClick={() => signOut({ callbackUrl })}>
      {children}
    </button>
  );
}
