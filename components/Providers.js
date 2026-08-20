"use client";

import { SessionProvider } from "next-auth/react";

// Wallet/social login (Privy) was removed from the UI — PulseFy uses email +
// password auth only. The Privy server bridge, dependencies, and migration stay
// in the codebase (dormant), so the wallet flow can be re-added later without
// re-installing packages or re-writing the bridge.
export default function Providers({ children }) {
  return <SessionProvider>{children}</SessionProvider>;
}
