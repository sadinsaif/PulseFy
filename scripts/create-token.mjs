// scripts/create-token.mjs — create the $PULSE SPL token (mint + metadata + supply).
//
// YOU run this with YOUR OWN funded keypair. It never leaves your machine; the
// secret key is read from a local gitignored file and is never printed or sent
// anywhere. It costs SOL (rent + fees). On devnet that SOL is free (airdropped);
// on mainnet it is real money and the mint is IRREVERSIBLE — test on devnet first.
//
// Usage:
//   1) Put a funded keypair at ./.keys/id.json  (Solana CLI format: JSON byte array)
//        solana-keygen new --outfile ./.keys/id.json      # if you need a fresh one
//   2) Set env (or use .env values):
//        NEXT_PUBLIC_SOLANA_NETWORK=devnet
//        SOLANA_KEYPAIR_PATH=./.keys/id.json
//        (optional) TOKEN_NAME, NEXT_PUBLIC_TOKEN_SYMBOL, NEXT_PUBLIC_TOKEN_DECIMALS,
//                   TOKEN_SUPPLY, TOKEN_METADATA_URI, NEXT_PUBLIC_SITE_URL
//   3) Run:
//        node scripts/create-token.mjs                     # devnet, authorities kept
//        node scripts/create-token.mjs --revoke-freeze     # recommended for trust
//        node scripts/create-token.mjs --revoke-mint       # fixed supply, no more minting
//        node scripts/create-token.mjs --yes               # required to run on mainnet
//   4) Copy the printed mint address into NEXT_PUBLIC_TOKEN_MINT.
//
// Flags: --revoke-mint  --revoke-freeze  --yes (confirm mainnet)  --no-airdrop

import { readFileSync } from "node:fs";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  createFungible,
  mintV1,
  mplTokenMetadata,
  TokenStandard,
} from "@metaplex-foundation/mpl-token-metadata";
import {
  generateSigner,
  keypairIdentity,
  percentAmount,
} from "@metaplex-foundation/umi";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  clusterApiUrl,
} from "@solana/web3.js";
import { setAuthority, AuthorityType } from "@solana/spl-token";

const args = new Set(process.argv.slice(2));
const REVOKE_MINT = args.has("--revoke-mint");
const REVOKE_FREEZE = args.has("--revoke-freeze");
const CONFIRMED = args.has("--yes");
const NO_AIRDROP = args.has("--no-airdrop");

const NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet";
const RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC ||
  (NETWORK === "mainnet-beta"
    ? clusterApiUrl("mainnet-beta")
    : NETWORK === "testnet"
      ? clusterApiUrl("testnet")
      : clusterApiUrl("devnet"));

const KEYPAIR_PATH = process.env.SOLANA_KEYPAIR_PATH || "./.keys/id.json";

const NAME = process.env.TOKEN_NAME || "PulseFy";
const SYMBOL = process.env.NEXT_PUBLIC_TOKEN_SYMBOL || "PULSE";
const DECIMALS = Number(process.env.NEXT_PUBLIC_TOKEN_DECIMALS || 9);
const SUPPLY = BigInt(process.env.TOKEN_SUPPLY || "1000000000"); // whole tokens
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const METADATA_URI =
  process.env.TOKEN_METADATA_URI || `${SITE_URL.replace(/\/$/, "")}/token/metadata.json`;

function die(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

function loadKeypairBytes(path) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    die(
      `Keypair not found at ${path}.\n   Create one with:  solana-keygen new --outfile ${path}\n   (then fund it — on devnet the script can airdrop for you).`
    );
  }
  let arr;
  try {
    arr = JSON.parse(raw);
  } catch {
    die(`Keypair file ${path} is not valid JSON (expected a byte array like [12,34,...]).`);
  }
  if (!Array.isArray(arr) || arr.length < 32) {
    die(`Keypair file ${path} is not a Solana secret-key byte array.`);
  }
  return Uint8Array.from(arr);
}

async function main() {
  console.log(`\n🪙  Creating ${NAME} ($${SYMBOL}) on ${NETWORK}`);
  console.log(`    RPC:      ${RPC}`);
  console.log(`    Decimals: ${DECIMALS}   Supply: ${SUPPLY.toLocaleString("en-US")}`);
  console.log(`    Metadata: ${METADATA_URI}`);

  if (NETWORK === "mainnet-beta" && !CONFIRMED) {
    die(
      "MAINNET is real money and the mint is IRREVERSIBLE.\n" +
        "   Re-run with --yes once you've verified the tokenomics and metadata,\n" +
        "   and strongly consider --revoke-freeze (and --revoke-mint for fixed supply)."
    );
  }

  const secret = loadKeypairBytes(KEYPAIR_PATH);
  const web3Payer = Keypair.fromSecretKey(secret);
  console.log(`    Payer:    ${web3Payer.publicKey.toBase58()}`);

  const connection = new Connection(RPC, "confirmed");

  // Fund on devnet/testnet if the payer is low. Public airdrops are rate-limited;
  // if it fails, we tell you to fund manually rather than blocking.
  if (!NO_AIRDROP && NETWORK !== "mainnet-beta") {
    const bal = await connection.getBalance(web3Payer.publicKey);
    console.log(`    Balance:  ${(bal / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    if (bal < 0.5 * LAMPORTS_PER_SOL) {
      try {
        console.log("    Requesting 1 SOL airdrop…");
        const sig = await connection.requestAirdrop(web3Payer.publicKey, LAMPORTS_PER_SOL);
        const bh = await connection.getLatestBlockhash();
        await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
        console.log("    ✅ Airdrop confirmed.");
      } catch {
        console.log(
          "    ⚠️  Airdrop failed (rate-limited). Fund the payer manually, e.g.:\n" +
            `        solana airdrop 2 ${web3Payer.publicKey.toBase58()} --url ${RPC}\n` +
            "        or https://faucet.solana.com — then re-run."
        );
      }
    }
  } else if (NETWORK === "mainnet-beta") {
    const bal = await connection.getBalance(web3Payer.publicKey);
    console.log(`    Balance:  ${(bal / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    if (bal < 0.02 * LAMPORTS_PER_SOL) {
      die("Payer has too little SOL for mainnet rent + fees. Fund it and re-run.");
    }
  }

  // umi identity = the same keypair (create + mint authority).
  const umi = createUmi(RPC).use(mplTokenMetadata());
  const umiKp = umi.eddsa.createKeypairFromSecretKey(secret);
  umi.use(keypairIdentity(umiKp));

  const mint = generateSigner(umi);
  console.log(`\n→ Creating mint + metadata:  ${mint.publicKey.toString()}`);
  await createFungible(umi, {
    mint,
    name: NAME,
    symbol: SYMBOL,
    uri: METADATA_URI,
    sellerFeeBasisPoints: percentAmount(0),
    decimals: DECIMALS,
  }).sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });
  console.log("  ✅ Mint + metadata created.");

  const baseUnits = SUPPLY * 10n ** BigInt(DECIMALS);
  console.log(`→ Minting supply (${baseUnits.toString()} base units) to payer…`);
  await mintV1(umi, {
    mint: mint.publicKey,
    authority: umi.identity,
    amount: baseUnits,
    tokenOwner: umi.identity.publicKey,
    tokenStandard: TokenStandard.Fungible,
  }).sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });
  console.log("  ✅ Supply minted.");

  // Optional authority revocation (via spl-token; same key already signs).
  const web3Mint = new PublicKey(mint.publicKey.toString());
  if (REVOKE_FREEZE) {
    console.log("→ Revoking FREEZE authority…");
    await setAuthority(connection, web3Payer, web3Mint, web3Payer, AuthorityType.FreezeAccount, null);
    console.log("  ✅ Freeze authority revoked (no account can be frozen).");
  }
  if (REVOKE_MINT) {
    console.log("→ Revoking MINT authority (supply is now FIXED)…");
    await setAuthority(connection, web3Payer, web3Mint, web3Payer, AuthorityType.MintTokens, null);
    console.log("  ✅ Mint authority revoked. No more tokens can ever be minted.");
  }

  const explorerSuffix = NETWORK === "mainnet-beta" ? "" : `?cluster=${NETWORK}`;
  console.log("\n────────────────────────────────────────────────────────");
  console.log("✅ DONE.");
  console.log(`   Mint address: ${mint.publicKey.toString()}`);
  console.log(`   Explorer:     https://explorer.solana.com/address/${mint.publicKey.toString()}${explorerSuffix}`);
  console.log("\n   Add this to your env (.env.local / Vercel):");
  console.log(`   NEXT_PUBLIC_TOKEN_MINT=${mint.publicKey.toString()}`);
  if (!REVOKE_FREEZE) console.log("\n   Tip: freeze authority is still held. Consider --revoke-freeze for holder trust.");
  if (!REVOKE_MINT) console.log("   Tip: mint authority is still held (you can mint more, e.g. to fund the treasury).");
  console.log("────────────────────────────────────────────────────────\n");
}

main().catch((e) => {
  console.error("\n❌ Token creation failed:", e?.message || e);
  process.exit(1);
});
