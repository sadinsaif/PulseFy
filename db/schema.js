import {
  pgTable,
  text,
  timestamp,
  primaryKey,
  serial,
  integer,
} from "drizzle-orm/pg-core";

/**
 * Users — our own table (email + password auth).
 * emailVerified stays null until the user clicks the verification link.
 */
export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  company: text("company"),
  role: text("role").notNull().default("creator"), // "creator" | "brand"
  // Public creator profile fields.
  username: text("username"),
  bio: text("bio"),
  twitter: text("twitter"),
  instagram: text("instagram"),
  interests: text("interests"), // comma-separated tags
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

/**
 * Auth.js sessions table (used by the Drizzle adapter).
 */
export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

/**
 * Auth.js accounts table (for OAuth providers — kept for future use).
 */
export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: serial("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  })
);

/**
 * Campaigns — a brand's product-promotion brief that creators submit clips to.
 * brandId is the owner (a user with role "brand"). reward is paid per approved
 * post. status: "active" (open) | "paused" | "ended".
 */
export const campaigns = pgTable("campaigns", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  brandId: text("brand_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  brief: text("brief"),
  platform: text("platform").notNull().default("any"), // any|tiktok|instagram|youtube|x
  reward: integer("reward").notNull().default(0), // dollars per approved post
  status: text("status").notNull().default("active"), // active|paused|ended
  // GIMI-style rich fields
  submitType: text("submit_type").default("distribution"), // distribution | source
  requirements: text("requirements"), // must-include (e.g. #hashtag, @mention, link)
  contentType: text("content_type").default("ugc"), // ugc | edit | ai | open
  assetsUrl: text("assets_url"), // cloud/Drive link to logos, examples, inspirations
  visibility: text("visibility").default("public"), // public | private
  showContributions: text("show_contributions").default("yes"), // yes | no
  thumbnailUrl: text("thumbnail_url"), // campaign card image
  bannerUrl: text("banner_url"), // campaign detail hero image
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

/**
 * Submissions — a creator's entry into a challenge.
 * postUrl is the link to their published clip (TikTok / Instagram / YouTube / X).
 * status: "pending" (awaiting review) | "approved" | "rejected".
 */
export const submissions = pgTable("submissions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  challengeId: text("challenge_id").notNull(), // human label (campaign title or legacy id)
  campaignId: text("campaign_id"), // set when the submission targets a real campaign
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(), // tiktok | instagram | youtube | x
  postUrl: text("post_url").notNull(),
  caption: text("caption"),
  status: text("status").notNull().default("pending"),
  reward: integer("reward").notNull().default(0), // dollars, set by admin on approval
  views: integer("views").notNull().default(0), // post views, verified at review
  engagement: integer("engagement").notNull().default(0), // likes+comments+shares, verified at review
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

/**
 * In-app notifications. One row per recipient.
 * type: "submission" (creator → admin) | "review" (admin → creator).
 * link is where clicking the notification takes the user.
 */
export const notifications = pgTable("notifications", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  message: text("message").notNull(),
  link: text("link"),
  read: text("read").notNull().default("no"), // "no" | "yes"
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

/**
 * Withdrawals — a creator cashing out their earned balance.
 * amount/fee/net are stored in CENTS (integer) so the 5% fee stays exact.
 * method: "stablecoin" | "bank". For stablecoin: coin (e.g. "usdc"),
 * network (e.g. "base" | "ethereum") and destination = wallet address.
 * For bank: destination = the payout email/reference.
 * status: "pending" (requested) | "paid" | "failed".
 */
export const withdrawals = pgTable("withdrawals", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull().default(0), // requested, in cents
  fee: integer("fee").notNull().default(0), // processing fee, in cents
  net: integer("net").notNull().default(0), // creator receives, in cents
  method: text("method").notNull().default("stablecoin"), // stablecoin | bank
  coin: text("coin"), // usdc (stablecoin only)
  network: text("network"), // base | ethereum (stablecoin only)
  destination: text("destination").notNull(), // wallet address or payout email
  status: text("status").notNull().default("pending"), // pending | paid | failed
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

/**
 * Tokens for email verification AND password reset.
 * `identifier` is the user's email; `purpose` distinguishes the two flows.
 */
export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    purpose: text("purpose").notNull().default("verify"), // "verify" | "reset"
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
  })
);
