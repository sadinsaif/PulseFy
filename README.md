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

`POSTGRES_URL` / `POSTGRES_URL_NON_POOLING` are set automatically by step 3 — you don't add them by hand.

> `AUTH_URL` matters: verification and reset emails build their links from it. If it's wrong, the links in emails will point to the wrong host.

### 6. Create the database tables
The schema lives in `db/schema.js`. Push it to your Postgres database **once** with drizzle-kit. Run this locally with the production DB URL in your environment:

```bash
# Pull the Vercel env vars into a local file first:
vercel env pull .env.local
npm install
npm run db:push        # runs: drizzle-kit push
```

`npm run db:push` reads `POSTGRES_URL` and creates the `users`, `sessions`, `accounts`, `verificationTokens`, and `submissions` tables.

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
npm run db:push                # create tables (needs a Postgres URL)
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
