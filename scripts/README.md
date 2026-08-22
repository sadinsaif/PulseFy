# PulseFy scripts

Operational scripts you run **manually** with your own funded Solana keypair.
They never run in the app, and they never print or transmit your secret key.

## Safety first

- **Keypairs live in `./.keys/`** (gitignored). Never commit a secret key.
- **Devnet is free and reversible-ish** (throwaway mints). **Mainnet is real money
  and irreversible.** Test the whole flow on devnet before mainnet.
- The **treasury key can move all reward funds** — for mainnet keep it offline /
  on hardware, never in the app or repo.

---

## 1. `create-token.mjs` — mint the $PULSE token

Creates the SPL mint (9 decimals), attaches Metaplex metadata (name/symbol/logo),
and mints the full supply to your payer wallet.

```bash
# one-time: make a keypair (or reuse your Solana CLI id.json)
solana-keygen new --outfile ./.keys/id.json

# devnet, authorities kept (default)
NEXT_PUBLIC_SOLANA_NETWORK=devnet SOLANA_KEYPAIR_PATH=./.keys/id.json \
  node scripts/create-token.mjs

# recommended for holder trust: give up the freeze authority
node scripts/create-token.mjs --revoke-freeze

# fixed supply forever (can't mint more — do this only if you won't need to
# top up the rewards treasury by minting):
node scripts/create-token.mjs --revoke-mint

# mainnet requires an explicit confirmation:
NEXT_PUBLIC_SOLANA_NETWORK=mainnet-beta node scripts/create-token.mjs --yes --revoke-freeze
```

The script prints the **mint address** — paste it into `NEXT_PUBLIC_TOKEN_MINT`
(`.env.local` for local dev, and the Vercel env for production).

Tokenomics come from env (all optional; sensible defaults shown):
`TOKEN_NAME=PulseFy`, `NEXT_PUBLIC_TOKEN_SYMBOL=PULSE`,
`NEXT_PUBLIC_TOKEN_DECIMALS=9`, `TOKEN_SUPPLY=1000000000`,
`TOKEN_METADATA_URI=<site>/token/metadata.json`.

The logo + metadata are served from `public/token/` — replace `public/token/logo.png`
with your real logo before mainnet, and (for mainnet) host the metadata on immutable
storage (Arweave/Irys) and point `TOKEN_METADATA_URI` at it.

---

## 2. `pay-claims.mjs` — pay out approved reward claims (added in Phase 2)

Sends $PULSE from the **treasury** wallet to each pending claim's destination and
records the tx signature. See the header of that script for usage.
