"use client";

import { useEffect, useRef } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";

/**
 * Invisible helper for the payouts page. Embedded-wallet creation can lag the
 * first Privy login, so the address may not exist when the bridge runs at
 * sign-in. Once Privy reports an embedded wallet client-side, this asks the
 * server to re-read and persist it (POST /api/privy/wallet). The server re-reads
 * from Privy by the caller's stored privy_id and never trusts a client-supplied
 * address — this component only signals "a wallet now exists, go capture it".
 *
 * Only mounted when NEXT_PUBLIC_PRIVY_APP_ID is set (so it's inside PrivyProvider).
 * Calls onSynced() after a successful persist so the parent can refresh.
 */
export default function PrivyWalletSync({ onSynced }) {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const done = useRef(false);

  const hasEmbedded = (wallets || []).some((w) => w.walletClientType === "privy");

  useEffect(() => {
    if (!ready || !authenticated || !hasEmbedded || done.current) return;
    done.current = true;
    (async () => {
      try {
        const res = await fetch("/api/privy/wallet", { method: "POST" });
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data.changed) onSynced?.();
        } else {
          done.current = false; // allow a retry on a transient failure
        }
      } catch {
        done.current = false;
      }
    })();
  }, [ready, authenticated, hasEmbedded, onSynced]);

  return null;
}
