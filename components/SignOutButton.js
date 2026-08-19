"use client";

import { signOut } from "next-auth/react";
import { usePrivy } from "@privy-io/react-auth";

// Public app id, inlined at build time. Mirrors the guard in Providers.js: when
// unset, PrivyProvider isn't mounted, so we must NOT call usePrivy().
const PRIVY_ON = !!process.env.NEXT_PUBLIC_PRIVY_APP_ID;

/**
 * Sign-out button that clears BOTH sessions. A live Privy session can silently
 * re-mint an access token, so when Privy is configured we clear it FIRST, then
 * the NextAuth session. Drop-in replacement for the old inline
 * `signOut({ callbackUrl })` buttons — accepts className/style/children.
 */
export default function SignOutButton(props) {
  return PRIVY_ON ? <PrivyAwareSignOut {...props} /> : <PlainSignOut {...props} />;
}

function PlainSignOut({ className, style, children = "Sign out", callbackUrl = "/" }) {
  return (
    <button type="button" className={className} style={style} onClick={() => signOut({ callbackUrl })}>
      {children}
    </button>
  );
}

function PrivyAwareSignOut({ className, style, children = "Sign out", callbackUrl = "/" }) {
  // Safe: this component only renders when PRIVY_ON, i.e. inside PrivyProvider.
  const { logout } = usePrivy();
  async function onClick() {
    try {
      await logout();
    } catch {
      /* ignore — still clear the NextAuth session below */
    }
    await signOut({ callbackUrl });
  }
  return (
    <button type="button" className={className} style={style} onClick={onClick}>
      {children}
    </button>
  );
}
