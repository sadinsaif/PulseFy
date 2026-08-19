"use client";

import { SessionProvider } from "next-auth/react";
import { PrivyProvider } from "@privy-io/react-auth";

// Public app id is inlined at build time. When it's absent (e.g. local dev with
// no Privy env), we skip PrivyProvider entirely so email/password auth still
// works and usePrivy()-based components simply aren't mounted. The signup/login
// pages and SignOutButton read the SAME flag, so the two stay consistent.
const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

export default function Providers({ children }) {
  const inner = <SessionProvider>{children}</SessionProvider>;
  if (!PRIVY_APP_ID) return inner;

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        // Match the dark PulseFy UI — no new brand assets, just the app's own
        // dark theme and sunset-orange accent (--accent: #ff7a45).
        appearance: {
          theme: "dark",
          accentColor: "#ff7a45",
          landingHeader: "Sign in to PulseFy",
          loginMessage: "Use email, a social account, or your wallet.",
        },
        // Auto-provision an embedded Ethereum wallet (its 0x address doubles as
        // the user's USDC-on-Base withdrawal address) for anyone who doesn't
        // already have one linked.
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
        },
      }}
    >
      {inner}
    </PrivyProvider>
  );
}
