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
 * Submissions — a creator's entry into a challenge.
 * postUrl is the link to their published clip (TikTok / Instagram / YouTube / X).
 * status: "pending" (awaiting review) | "approved" | "rejected".
 */
export const submissions = pgTable("submissions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  challengeId: text("challenge_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(), // tiktok | instagram | youtube | x
  postUrl: text("post_url").notNull(),
  caption: text("caption"),
  status: text("status").notNull().default("pending"),
  reward: integer("reward").notNull().default(0), // dollars, set by admin on approval
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
