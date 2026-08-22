"use client";

import { useMemo } from "react";
import { SessionProvider } from "next-auth/react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { getRpcEndpoint } from "@/lib/solana";
import "@solana/wallet-adapter-react-ui/styles.css";

// The app's single client-provider boundary.
//
// Privy (wallet/social login) stays DORMANT — the server bridge + deps remain in
// the codebase but the client SDK is not mounted; PulseFy uses email+password auth.
//
// The Solana wallet-adapter providers nest INSIDE SessionProvider so the $PULSE
// dApp (wallet connect, on-chain balance, claims) has wallet context everywhere,
// while auth remains the outer source of truth for who the user is. The wallet is
// only ever LINKED to a signed-in account after a signature check — connecting a
// wallet never signs anyone in.
export default function Providers({ children }) {
  const endpoint = useMemo(() => getRpcEndpoint(), []);
  // Empty adapter list on purpose: Phantom, Solflare, Backpack, etc. register via
  // the Wallet Standard and are auto-detected, so we don't bundle per-wallet
  // adapter packages. autoConnect silently reconnects a previously-approved wallet.
  const wallets = useMemo(() => [], []);

  return (
    <SessionProvider>
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>{children}</WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </SessionProvider>
  );
}
