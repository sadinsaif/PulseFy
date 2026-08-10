import {
  pgTable,
  text,
  timestamp,
  primaryKey,
  uniqueIndex,
  serial,
  integer,
  bigint,
  boolean,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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
  // Referral — who invited this user (their referrer's id). Set once at signup
  // from a ?ref=<username> link; the referrer earns 5% of this user's payouts
  // for the first 90 days. Null for organic signups.
  referredBy: text("referred_by"),
  // Moderation access state. Warnings preserve access; suspended/banned block it.
  moderationStatus: text("moderation_status").notNull().default("active"),
  suspendedUntil: timestamp("suspended_until", { mode: "date" }),
  suspensionReason: text("suspension_reason"),
  banReason: text("ban_reason"),
  bannedAt: timestamp("banned_at", { mode: "date" }),
  bannedBy: text("banned_by").references(() => users.id, { onDelete: "set null" }),
  // Admin-controlled public verification. This is deliberately separate from
  // moderation status: verification never grants access or overrides a block.
  isVerified: boolean("is_verified").notNull().default(false),
  verifiedAt: timestamp("verified_at", { mode: "date" }),
  verifiedBy: text("verified_by").references(() => users.id, { onDelete: "set null" }),
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
  reward: integer("reward").notNull().default(0), // dollars per approved post ("Approval $")
  // Campaign economics (GIMI-style), all set by the brand at launch.
  budget: integer("budget").notNull().default(0), // total pool the brand funds ($)
  budgetSpent: integer("budget_spent").notNull().default(0), // committed approved rewards + spotlight bonuses
  spotlightReward: integer("spotlight_reward").notNull().default(0), // bonus ($) for a spotlighted post
  performanceMult: integer("performance_mult").notNull().default(1), // performance multiplier ("x1", "x2"…)
  // When the campaign closes. Null = open-ended (no countdown). A past value
  // means the campaign has effectively ended even if status is still "active".
  endsAt: timestamp("ends_at", { mode: "date" }),
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
  campaignId: text("campaign_id").references(() => campaigns.id, { onDelete: "set null" }), // set when the submission targets a real campaign
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(), // tiktok | instagram | youtube | x
  postUrl: text("post_url").notNull(),
  caption: text("caption"),
  status: text("status").notNull().default("pending"),
  reward: integer("reward").notNull().default(0), // dollars, set by admin on approval
  // bigint (not int4) — viral videos exceed 2.1B views and would overflow an
  // integer column, throwing on write. mode:"number" is safe: counts stay well
  // under 2^53. Verified at review or auto-fetched from YouTube.
  views: bigint("views", { mode: "number" }).notNull().default(0),
  engagement: bigint("engagement", { mode: "number" }).notNull().default(0), // likes+comments(+shares)
  // Spotlight — admin highlights an outstanding post; the creator earns a bonus
  // (whole dollars) on top of the campaign reward, and it shows in the public
  // "Spotlighted" showcase. Bonus counts toward earnings + withdrawable balance.
  spotlighted: boolean("spotlighted").notNull().default(false),
  spotlightBonus: integer("spotlight_bonus").notNull().default(0), // dollars
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
}, (table) => ({
  uniqueCreatorCampaign: uniqueIndex("submissions_unique_creator_campaign_idx")
    .on(table.userId, table.campaignId)
    .where(sql`${table.campaignId} is not null`),
  uniqueCreatorLegacyChallenge: uniqueIndex("submissions_unique_creator_legacy_challenge_idx")
    .on(table.userId, table.challengeId)
    .where(sql`${table.campaignId} is null`),
}));

/**
 * Append-only verified funding and campaign commitment records. The declared
 * campaign budget is intentionally separate from money recorded here.
 */
export const campaignFundingLedger = pgTable("campaign_funding_ledger", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "restrict" }),
  submissionId: text("submission_id").references(() => submissions.id, { onDelete: "restrict" }),
  actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(), // funding | reserve | release | spend | reversal
  amount: integer("amount").notNull(), // whole dollars; always positive
  reference: text("reference"), // verified payment/reference for funding only
  note: text("note"), // internal admin evidence/note; never public
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

/**
 * Direct messages — one row per message in a 1-on-1 conversation between two
 * users. senderId/recipientId are the two participants; `read` flips to "yes"
 * for the recipient when they open the thread. A "conversation" is just all
 * messages where the two ids match in either direction, ordered by time.
 */
export const messages = pgTable("messages", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  senderId: text("sender_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  recipientId: text("recipient_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  read: text("read").notNull().default("no"), // "no" | "yes" (from recipient's side)
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

/**
 * Follows — one row per follow relationship. followerId follows followingId.
 * A "follower count" is rows where followingId = the user; a "following count"
 * is rows where followerId = the user. The (follower_id, following_id) unique
 * index prevents duplicate follows. Both sides cascade-delete with the user.
 */
export const follows = pgTable("follows", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  followerId: text("follower_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  followingId: text("following_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

/**
 * Referral earnings — one row each time a referred creator's withdrawal is paid.
 * The referrer earns 5% of that payout (stored in CENTS to match withdrawals).
 * We record the source withdrawalId so a payout can never be counted twice.
 * These earnings are a separate, always-withdrawable balance for the referrer.
 */
export const referralEarnings = pgTable("referral_earnings", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  referrerId: text("referrer_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  refereeId: text("referee_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  withdrawalId: text("withdrawal_id").notNull().unique(), // the paid payout that earned this
  amount: integer("amount").notNull().default(0), // 5% commission, in cents
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

/** Moderation allegations. Reports remain private to the reporter and admins. */
export const reports = pgTable("reports", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  reporterId: text("reporter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reporterType: text("reporter_type").notNull(),
  reportedUserId: text("reported_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reportedUserType: text("reported_user_type").notNull(),
  reason: text("reason").notNull(),
  description: text("description").notNull(),
  evidence: text("evidence"),
  status: text("status").notNull().default("open"),
  priority: text("priority").notNull().default("normal"),
  assignedAdminId: text("assigned_admin_id").references(() => users.id, { onDelete: "set null" }),
  resolution: text("resolution"),
  resolutionNote: text("resolution_note"),
  resolvedBy: text("resolved_by").references(() => users.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

/** Immutable admin/report activity history for the report detail timeline. */
export const reportEvents = pgTable("report_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  reportId: text("report_id").notNull().references(() => reports.id, { onDelete: "cascade" }),
  actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

/** Append-only admin moderation and security audit trail. */
export const moderationEvents = pgTable("moderation_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  targetUserId: text("target_user_id").references(() => users.id, { onDelete: "set null" }),
  adminId: text("admin_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  reason: text("reason"),
  note: text("note"),
  previousStatus: text("previous_status"),
  newStatus: text("new_status"),
  expiresAt: timestamp("expires_at", { mode: "date" }),
  relatedReportId: text("related_report_id").references(() => reports.id, { onDelete: "set null" }),
  relatedCampaignId: text("related_campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

/** Explicit, owner-managed access to a private campaign. */
export const campaignParticipants = pgTable("campaign_participants", {
  campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  creatorId: text("creator_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("authorized"),
  authorizedBy: text("authorized_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.campaignId, table.creatorId] }),
}));

/** A completed-campaign review. Visibility is moderated without changing it. */
export const reviews = pgTable("reviews", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  reviewerId: text("reviewer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  revieweeId: text("reviewee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reviewerType: text("reviewer_type").notNull(),
  revieweeType: text("reviewee_type").notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment").notNull(),
  status: text("status").notNull().default("visible"),
  moderatedBy: text("moderated_by").references(() => users.id, { onDelete: "set null" }),
  moderationNote: text("moderation_note"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

/** Creator-owned work samples. Text and URLs are validated at the API boundary. */
export const creatorPortfolio = pgTable("creator_portfolio", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  creatorId: text("creator_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category"),
  thumbnailUrl: text("thumbnail_url"),
  workUrl: text("work_url").notNull(),
  platform: text("platform"),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

/** Normalized external links supplied by a creator; no third-party scraping. */
export const creatorSocialLinks = pgTable("creator_social_links", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  creatorId: text("creator_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  url: text("url").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});
