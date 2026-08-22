"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import WalletConnectButton from "@/components/WalletConnectButton";
import { shortAddress, explorerUrl, TOKEN_SYMBOL, NETWORK } from "@/lib/solana";

const STATUS_CLASS = { pending: "review", paid: "live", failed: "ended" };

function fmtDate(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

/**
 * The $PULSE holder dashboard. Non-custodial by design: tokens stay in the user's
 * own wallet — we only READ the on-chain balance and pay rewards OUT. The flow is
 *   connect wallet → sign a nonce to prove ownership (link) → hold to earn →
 *   claim accrued rewards to that same verified wallet.
 * All wallet state is client-only, so a `mounted` guard avoids hydration mismatch.
 */
export default function TokenDashboard() {
  const { publicKey, connected, signMessage } = useWallet();
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState(null); // GET /api/token/claim
  const [chain, setChain] = useState(null); // GET /api/token/balance
  const [linking, setLinking] = useState(false);
  const [linkErr, setLinkErr] = useState("");
  const [amount, setAmount] = useState("");
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimErr, setClaimErr] = useState("");
  const [claimMsg, setClaimMsg] = useState("");

  useEffect(() => setMounted(true), []);

  const address = mounted && connected && publicKey ? publicKey.toBase58() : "";

  const loadRewards = useCallback(async () => {
    try {
      const res = await fetch("/api/token/claim");
      const json = await res.json();
      if (res.ok) setData(json);
    } catch {
      /* silent */
    }
  }, []);

  const loadBalance = useCallback(async (addr) => {
    if (!addr) return setChain(null);
    try {
      const res = await fetch(`/api/token/balance?address=${encodeURIComponent(addr)}`);
      const json = await res.json();
      if (res.ok) setChain(json);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    if (mounted) loadRewards();
  }, [mounted, loadRewards]);

  const linkedWallet = data?.linkedWallet || null;
  const walletVerified = Boolean(data?.walletVerified);
  const activeWallet = linkedWallet || address;

  useEffect(() => {
    loadBalance(activeWallet);
  }, [activeWallet, loadBalance]);

  // Prove ownership of the CONNECTED wallet, then link it to the account.
  const linkWallet = useCallback(async () => {
    setLinkErr("");
    if (!publicKey || typeof signMessage !== "function") {
      setLinkErr("Connect a wallet that can sign messages (Phantom, Solflare).");
      return;
    }
    setLinking(true);
    try {
      const addr = publicKey.toBase58();
      const r1 = await fetch("/api/token/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "nonce", wallet: addr }),
      });
      const j1 = await r1.json();
      if (!r1.ok) throw new Error(j1.error || "Could not start verification.");

      const signature = await signMessage(new TextEncoder().encode(j1.message));

      const r2 = await fetch("/api/token/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", wallet: addr, signature: Array.from(signature) }),
      });
      const j2 = await r2.json();
      if (!r2.ok) throw new Error(j2.error || "Verification failed.");

      await loadRewards();
      await loadBalance(addr);
    } catch (e) {
      // Wallet user-rejection surfaces as a thrown error too — keep it friendly.
      setLinkErr(e?.message === "User rejected the request." ? "Signature cancelled." : e?.message || "Verification failed.");
    } finally {
      setLinking(false);
    }
  }, [publicKey, signMessage, loadRewards, loadBalance]);

  const submitClaim = useCallback(async () => {
    setClaimErr("");
    setClaimMsg("");
    if (!amount || Number(amount) <= 0) {
      setClaimErr("Enter an amount to claim.");
      return;
    }
    setClaimBusy(true);
    try {
      const res = await fetch("/api/token/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setClaimErr(json.error || "Could not submit the claim.");
        return;
      }
      setClaimMsg(json.message || "Claim requested — it's now pending payout.");
      setAmount("");
      await loadRewards();
    } catch {
      setClaimErr("Network error. Please try again.");
    } finally {
      setClaimBusy(false);
    }
  }, [amount, loadRewards]);

  // Not-yet-launched state: the token mint isn't wired into env.
  if (data && data.configured === false) {
    return (
      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel-head"><h3>${TOKEN_SYMBOL} is launching soon</h3></div>
        <p className="brief" style={{ marginTop: 10 }}>
          The ${TOKEN_SYMBOL} token isn&apos;t live yet. Once it launches you&apos;ll be able to
          connect your Solana wallet here, see your holdings, and claim hold-to-earn rewards.
        </p>
      </section>
    );
  }

  const available = data?.balance?.available || "0";
  const earned = data?.balance?.earned || "0";
  const claimed = data?.balance?.claimed || "0";
  const availableDisplay = data?.balance?.availableDisplay || "0";
  const canClaim = walletVerified && Number(available) > 0;
  const mismatch = mounted && connected && linkedWallet && address && linkedWallet !== address;

  return (
    <>
      {/* Wallet connect + ownership verification */}
      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel-head">
          <h3>Your wallet</h3>
          <span className="tag-pill" style={{ background: "rgba(255,180,58,.15)", color: "var(--accent)" }}>
            {NETWORK}
          </span>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginTop: 12 }}>
          <WalletConnectButton />

          {mounted && walletVerified && linkedWallet && (
            <span className="status live">
              ✓ Verified&nbsp;
              <a href={explorerUrl(linkedWallet)} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>
                {shortAddress(linkedWallet, 4, 4)}
              </a>
            </span>
          )}

          {mounted && connected && !walletVerified && (
            <button className="btn btn-primary btn-sm" onClick={linkWallet} disabled={linking}>
              {linking ? "Verifying…" : "Verify & link this wallet"}
            </button>
          )}

          {mismatch && (
            <button className="btn btn-ghost btn-sm" onClick={linkWallet} disabled={linking}>
              {linking ? "Switching…" : "Link this connected wallet instead"}
            </button>
          )}
        </div>

        {linkErr && <div className="alert err" style={{ marginTop: 12 }}>{linkErr}</div>}

        {mismatch && (
          <p className="brief" style={{ marginTop: 10 }}>
            You&apos;re connected as <b>{shortAddress(address, 4, 4)}</b> but your linked wallet is{" "}
            <b>{shortAddress(linkedWallet, 4, 4)}</b>. Rewards accrue on the linked wallet.
          </p>
        )}
        {mounted && !connected && (
          <p className="brief" style={{ marginTop: 10 }}>
            Connect your Solana wallet, then sign a free message to prove you own it. Signing
            never moves funds or sends a transaction — it just links the wallet to your account.
          </p>
        )}
      </section>

      {/* Balances */}
      <section className="kpis" style={{ marginTop: 18 }}>
        <div className="kpi">
          <div className="k-top"><div className="k-ic">🪙</div></div>
          <div className="k-val">{chain?.balance ? Number(chain.balance).toLocaleString() : "0"}</div>
          <div className="k-lbl">On-chain balance ({TOKEN_SYMBOL})</div>
        </div>
        <div className="kpi">
          <div className="k-top"><div className="k-ic">✨</div></div>
          <div className="k-val">{Number(available).toLocaleString()}</div>
          <div className="k-lbl">Claimable rewards</div>
        </div>
        <div className="kpi">
          <div className="k-top"><div className="k-ic">📈</div></div>
          <div className="k-val">{Number(earned).toLocaleString()}</div>
          <div className="k-lbl">Total earned</div>
        </div>
        <div className="kpi">
          <div className="k-top"><div className="k-ic">💸</div></div>
          <div className="k-val">{Number(claimed).toLocaleString()}</div>
          <div className="k-lbl">Claimed</div>
        </div>
      </section>

      {/* Claim */}
      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel-head"><h3>Claim rewards</h3></div>

        {!walletVerified ? (
          <p className="brief" style={{ marginTop: 10 }}>
            Link and verify a wallet above to start earning and claiming rewards.
          </p>
        ) : (
          <>
            <p className="brief" style={{ marginTop: 10 }}>
              You have <b>{availableDisplay} {TOKEN_SYMBOL}</b> available. Claims are paid to your
              verified wallet from the community treasury after review.
            </p>

            {claimErr && <div className="alert err" style={{ marginTop: 12 }}>{claimErr}</div>}
            {claimMsg && <div className="alert ok" style={{ marginTop: 12 }}>{claimMsg}</div>}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: 12 }}>
              <input
                type="number"
                min="0"
                step="any"
                value={amount}
                placeholder="0.0"
                onChange={(e) => setAmount(e.target.value)}
                style={{
                  flex: "1 1 200px", padding: "10px 12px", borderRadius: 10,
                  border: "1px solid var(--border)", background: "var(--bg-elev)", color: "inherit",
                }}
              />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAmount(available)}>
                Max
              </button>
              <button className="btn btn-primary" onClick={submitClaim} disabled={claimBusy || !canClaim}>
                {claimBusy ? "Submitting…" : "Request claim"}
              </button>
            </div>
          </>
        )}
      </section>

      {/* History */}
      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel-head"><h3>Claim history</h3></div>
        {!data ? (
          <p className="brief" style={{ marginTop: 10 }}>Loading…</p>
        ) : (data.claims || []).length === 0 ? (
          <p className="brief" style={{ marginTop: 10 }}>No claims yet.</p>
        ) : (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>Amount</th>
                  <th>Destination</th>
                  <th>Status</th>
                  <th>Tx</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {data.claims.map((c) => (
                  <tr key={c.id}>
                    <td style={{ color: "var(--accent-3)", fontWeight: 700 }}>
                      {c.amountDisplay} {TOKEN_SYMBOL}
                    </td>
                    <td>{shortAddress(c.destination, 4, 4)}</td>
                    <td><span className={`status ${STATUS_CLASS[c.status] || "review"}`}>{c.status}</span></td>
                    <td>
                      {c.txSignature ? (
                        <a href={explorerUrl(c.txSignature, "tx")} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
                          View ↗
                        </a>
                      ) : (
                        <span style={{ color: "var(--text-mute)" }}>—</span>
                      )}
                    </td>
                    <td>{fmtDate(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
