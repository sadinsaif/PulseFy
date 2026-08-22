// scripts/pay-claims.mjs — settle pending $PULSE reward claims from the treasury.
//
// The ADMIN/operator runs this with the TREASURY keypair. It reads pending claims
// straight from the database, sends the SPL tokens from the treasury wallet to
// each claim's (already-verified) destination, and marks the claim `paid` with the
// on-chain tx signature. Custody + signing stay entirely with the operator; the
// app never holds the treasury key.
//
// SAFETY: dry-run by DEFAULT — it shows exactly what WOULD be sent and never
// touches the chain or the DB until you pass --yes. On mainnet this is real money
// and irreversible.
//
// Usage:
//   1) Fund the treasury wallet with $PULSE (and a little SOL for fees + ATA rent).
//   2) Put the treasury keypair at ./.keys/treasury.json (gitignored).
//   3) Provide env: POSTGRES_URL (same as the app), NEXT_PUBLIC_TOKEN_MINT,
//      NEXT_PUBLIC_TOKEN_DECIMALS, NEXT_PUBLIC_SOLANA_NETWORK, NEXT_PUBLIC_SOLANA_RPC.
//      Easiest: node --env-file=.env.local scripts/pay-claims.mjs
//   4) Dry-run first, then send:
//        node --env-file=.env.local scripts/pay-claims.mjs               # preview
//        node --env-file=.env.local scripts/pay-claims.mjs --yes         # execute
//        node --env-file=.env.local scripts/pay-claims.mjs --yes --limit 5
//
// Note: marking a claim `paid` here does NOT email the holder. To also notify
// them, leave --no-mark and instead mark each claim paid in the admin UI
// (/dashboard/token-claims) using the tx signature this script prints.
//
// Flags: --yes (execute)  --limit N  --no-mark (send but don't write the DB)

import { readFileSync } from "node:fs";
import { sql } from "@vercel/postgres";
import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  transferChecked,
  getAccount,
} from "@solana/spl-token";

const args = new Set(process.argv.slice(2));
const EXECUTE = args.has("--yes");
const NO_MARK = args.has("--no-mark");
const limitArg = process.argv.find((a, i) => process.argv[i - 1] === "--limit");
const LIMIT = limitArg ? Math.max(1, parseInt(limitArg, 10) || 0) : null;

const NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet";
const RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC ||
  (NETWORK === "mainnet-beta"
    ? clusterApiUrl("mainnet-beta")
    : NETWORK === "testnet"
      ? clusterApiUrl("testnet")
      : clusterApiUrl("devnet"));
const MINT = process.env.NEXT_PUBLIC_TOKEN_MINT || "";
const DECIMALS = Number(process.env.NEXT_PUBLIC_TOKEN_DECIMALS || 9);
const TREASURY_PATH = process.env.TREASURY_KEYPAIR_PATH || "./.keys/treasury.json";
const SYMBOL = process.env.NEXT_PUBLIC_TOKEN_SYMBOL || "PULSE";

function die(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

function fmt(baseUnits) {
  const b = BigInt(baseUnits);
  const digits = b.toString().padStart(DECIMALS + 1, "0");
  const whole = digits.slice(0, digits.length - DECIMALS).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = digits.slice(digits.length - DECIMALS).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

function loadKeypair(path) {
  let arr;
  try {
    arr = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    die(`Treasury keypair not found or invalid at ${path} (expected a JSON byte array).`);
  }
  if (!Array.isArray(arr) || arr.length < 32) die(`${path} is not a Solana secret-key byte array.`);
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

async function main() {
  if (!MINT) die("NEXT_PUBLIC_TOKEN_MINT is not set — run scripts/create-token.mjs first.");
  if (!process.env.POSTGRES_URL) die("POSTGRES_URL is not set (use --env-file=.env.local).");

  console.log(`\n🏦  Pay $${SYMBOL} claims on ${NETWORK}   (${EXECUTE ? "EXECUTE" : "DRY-RUN"})`);
  console.log(`    RPC:  ${RPC}`);
  console.log(`    Mint: ${MINT}`);

  const { rows } = await sql`
    SELECT id, user_id, amount, destination, created_at
    FROM token_claims
    WHERE status = 'pending'
    ORDER BY created_at ASC
  `;
  const claims = LIMIT ? rows.slice(0, LIMIT) : rows;

  if (!claims.length) {
    console.log("\n✅ No pending claims. Nothing to do.\n");
    return;
  }

  const total = claims.reduce((s, c) => s + BigInt(c.amount), 0n);
  console.log(`\n    ${claims.length} pending claim(s), total ${fmt(total)} ${SYMBOL}:`);
  for (const c of claims) {
    console.log(`      • ${fmt(c.amount)} ${SYMBOL} → ${c.destination}   [${c.id}]`);
  }

  if (!EXECUTE) {
    console.log(`\n👉 Dry-run only. Re-run with --yes to send from the treasury.\n`);
    return;
  }

  const treasury = loadKeypair(TREASURY_PATH);
  const conn = new Connection(RPC, "confirmed");
  const mint = new PublicKey(MINT);
  console.log(`    Treasury: ${treasury.publicKey.toBase58()}`);

  // Ensure the treasury token account exists and holds enough.
  const treasuryAta = await getOrCreateAssociatedTokenAccount(conn, treasury, mint, treasury.publicKey);
  const acct = await getAccount(conn, treasuryAta.address);
  if (acct.amount < total) {
    die(`Treasury holds ${fmt(acct.amount.toString())} ${SYMBOL} but ${fmt(total)} is needed. Top it up and re-run.`);
  }

  let paid = 0;
  let failed = 0;
  for (const c of claims) {
    const amount = BigInt(c.amount);
    try {
      const dest = new PublicKey(c.destination);
      const destAta = await getOrCreateAssociatedTokenAccount(conn, treasury, mint, dest);
      const sig = await transferChecked(
        conn,
        treasury,
        treasuryAta.address,
        mint,
        destAta.address,
        treasury.publicKey,
        amount,
        DECIMALS
      );
      console.log(`  ✅ PAID  ${fmt(amount)} ${SYMBOL} → ${c.destination}  tx=${sig}`);

      if (!NO_MARK) {
        // Only transition pending → paid; never overwrite an already-settled row.
        await sql`
          UPDATE token_claims
          SET status = 'paid', tx_signature = ${sig}, updated_at = now()
          WHERE id = ${c.id} AND status = 'pending'
        `;
      } else {
        console.log(`     ↳ mark paid in the admin UI:  claim ${c.id}  tx ${sig}`);
      }
      paid += 1;
    } catch (e) {
      failed += 1;
      console.error(`  ⚠️  FAILED ${c.id} → ${c.destination}: ${e?.message || e}`);
    }
  }

  console.log(`\n────────────────────────────────────────────`);
  console.log(`✅ Done. Paid ${paid}, failed ${failed}.`);
  if (failed) console.log(`   Failed claims stay 'pending' — investigate and re-run.`);
  if (NO_MARK) console.log(`   --no-mark: claims left 'pending'. Mark them paid in the admin UI with the tx signatures above.`);
  console.log(`────────────────────────────────────────────\n`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\n❌ Payout run failed:", e?.message || e);
    process.exit(1);
  });
