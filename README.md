# PulseFy

**Infrastructure for the AI Creator Economy.** Brands launch content challenges, creators submit, AI filters what's on-brand, and rewards pay out automatically — from brief to payout.

This is a **Next.js 14 (App Router)** app with **real authentication**: email + password signup, email verification, login, and password reset. Built to deploy on **Vercel** with **Vercel Postgres** and **Resend** email.

---

## Tech stack

| Concern | Choice |
|---|---|
| Framework | Next.js 14 (App Router, plain JS/JSX) |
| Auth | Auth.js / NextAuth v5 (Credentials + email verification) |
| Database | Vercel Postgres (`@vercel/postgres`) |
| ORM | Drizzle ORM + drizzle-kit |
| Passwords | bcryptjs (hashed, never stored in plaintext) |
| Email | Resend |
| Validation | zod |

## What's included

- **Public site** — landing page (`/`) with the full sunset-themed marketing design.
- **Auth flow** — `/signup`, `/login`, `/forgot`, `/reset`, plus `/verify` (email-link landing).
- **Protected app** — `/dashboard`, `/challenge/[id]`, `/creator/[id]`, gated by middleware (unauthenticated visitors are redirected to `/login`).
- **Creator submissions** — on any challenge page, signed-in creators submit their published clip (platform + post link + caption). Stored in the `submissions` table; one entry per creator per challenge (resubmitting updates it and returns it to review).
- **API routes** — `/api/register`, `/api/forgot`, `/api/reset`, `/api/submit`, and Auth.js at `/api/auth/*`.

The original static HTML/CSS/JS prototype is preserved under `legacy/` for reference.

---

## Deploy to Vercel (step by step)

### 1. Push to GitHub
The repo is already at **github.com/sadinsaif/PulseFy**. Make sure your latest commit is pushed.

### 2. Import into Vercel
1. Go to [vercel.com/new](https://vercel.com/new) and import the `PulseFy` repo.
2. Vercel auto-detects Next.js — leave build settings as default.
3. **Don't deploy yet** — add the database and env vars first (below), otherwise the first build's runtime calls will fail.

### 3. Add Vercel Postgres
1. In your Vercel project → **Storage** tab → **Create Database** → **Postgres**.
2. Connect it to the project. Vercel automatically injects `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, and related variables into the project's environment.

### 4. Set up Resend (email)
1. Create a free account at [resend.com](https://resend.com).
2. Grab an **API key** from the dashboard.
3. For testing you can send from `onboarding@resend.dev` (Resend's shared sender). For production, verify your own domain and use e.g. `noreply@yourdomain.com`.

### 5. Add environment variables
In Vercel → project → **Settings → Environment Variables**, add:

| Variable | Value |
|---|---|
| `AUTH_SECRET` | A random secret — generate with `openssl rand -base64 32` |
| `AUTH_URL` | Your deployment URL, e.g. `https://pulsefycorp.vercel.app/` |
| `NEXTAUTH_URL` | Same as `AUTH_URL` |
| `RESEND_API_KEY` | Your Resend API key |
| `EMAIL_FROM` | `PulseFy <onboarding@resend.dev>` (or your verified sender) |
| `PULSEFY_FINANCIAL_MIGRATIONS_APPLIED` | Set to `016` only after the controlled 014 → 015 → 016 migration sequence has completed and been verified in that production database. |

`POSTGRES_URL` / `POSTGRES_URL_NON_POOLING` are set automatically by step 3 — you don't add them by hand.

> `AUTH_URL` matters: verification and reset emails build their links from it. If it's wrong, the links in emails will point to the wrong host.

### 6. Create and migrate the database
`npm run db:push` creates the base Drizzle schema, but it does **not** guarantee the hand-authored indexes and CHECK constraints in the numbered SQL migrations. Do not use it as the production migration mechanism for reports, moderation, or Trust System changes.

For a new or upgraded production database, use a controlled migration process with a backup and apply the numbered scripts **once, in order**, after the base schema is present:

```bash
# Run from a controlled environment with POSTGRES_URL set. Review and apply
# each script with your approved PostgreSQL migration tool; do not skip steps.
psql "$POSTGRES_URL" -v ON_ERROR_STOP=1 -f migrations/010_reports.sql
psql "$POSTGRES_URL" -v ON_ERROR_STOP=1 -f migrations/011_moderation.sql
psql "$POSTGRES_URL" -v ON_ERROR_STOP=1 -f migrations/012_trust_system.sql
psql "$POSTGRES_URL" -v ON_ERROR_STOP=1 -f migrations/013_private_campaign_access.sql
psql "$POSTGRES_URL" -v ON_ERROR_STOP=1 -f migrations/014_campaign_budget_spend.sql
psql "$POSTGRES_URL" -v ON_ERROR_STOP=1 -f migrations/015_submission_uniqueness.sql
psql "$POSTGRES_URL" -v ON_ERROR_STOP=1 -f migrations/016_campaign_funding_ledger.sql
```

`012_trust_system.sql` is required for Trust System database integrity. It creates the review relationship unique index, review CHECK constraints, creator social-link uniqueness, and Trust indexes that `db:push` alone does not guarantee. `014_campaign_budget_spend.sql` runs atomically and intentionally stops if historical rewards already exceed a campaign's declared budget; reconcile those campaigns before retrying. `015_submission_uniqueness.sql` intentionally stops if duplicate campaign submissions already exist; reconcile those campaigns before retrying. `016_campaign_funding_ledger.sql` deliberately does **not** treat declared campaign budgets as paid money and stops when historical rewards lack verifiable funding records; reconcile those records before retrying. Record each applied migration in your deployment change log and do not rerun migration scripts against an already-migrated database without first confirming their idempotency.

**Production financial release gate:** `npm run build` fails on Vercel production builds unless `PULSEFY_FINANCIAL_MIGRATIONS_APPLIED=016` is configured. Set this value only after applying and verifying migrations 014 → 015 → 016 for that exact database. For a non-Vercel production pipeline, set `PULSEFY_ENFORCE_FINANCIAL_MIGRATIONS=true` as well. This is an explicit release attestation, not proof from the application; it prevents a `db:push`-only deployment from silently being treated as financially protected.

### 7. Deploy
Trigger a deploy (push a commit, or click **Redeploy** in Vercel). Once live, test the full flow:

1. **Sign up** at `/signup` → check your email → click the verification link → lands on `/login?verify=success`.
2. **Log in** → redirected to `/dashboard`, your name shows in the sidebar.
3. **Log out** (sidebar button) → `/dashboard` now redirects to `/login`.
4. **Forgot password** at `/forgot` → check email → set a new password at `/reset` → log in with it.

---

## Run locally

Requires **Node.js 18+**.

```bash
cp .env.example .env.local     # then fill in the values
npm install
npm run db:push                # bootstrap the base Drizzle schema only
# For reports, moderation, and Trust System schema, apply 010 → 011 → 012 → 013 → 014 → 015 → 016
# with the controlled SQL migration process documented above.
npm run dev                    # http://localhost:3000
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run db:push` | Push the Drizzle schema to Postgres |
| `npm run db:studio` | Open Drizzle Studio to inspect the DB |

## Security notes

- Passwords are hashed with **bcrypt** (cost 10) — plaintext is never stored.
- Accounts must **verify their email** before they can sign in.
- **Forgot-password** always returns the same response whether or not the email is registered (no account-enumeration leak).
- Verification and reset tokens are single-use and time-limited (24h for verify, 1h for reset).
- No secrets are committed — `.env.local` and `.env` are gitignored; `.env.example` documents the variables with empty values.

## Project structure

```
app/
  page.js                 landing page
  layout.js               root layout + SessionProvider
  login/ signup/ forgot/ reset/ verify/   auth pages
  dashboard/              protected: overview
  challenge/[id]/         protected: challenge detail
  creator/[id]/           protected: creator profile
  api/
    auth/[...nextauth]/   Auth.js handlers
    register/ forgot/ reset/ submit/   auth + submission API routes
components/               Navbar, Sidebar, Chart, Reveal, Providers
db/                       Drizzle schema + client
lib/                      email, tokens, validation
auth.js                  full NextAuth config (Node runtime)
auth.config.js           edge-safe config (used by middleware)
middleware.js            route protection
legacy/                  original static prototype
```
