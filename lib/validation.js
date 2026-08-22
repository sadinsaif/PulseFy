import { z } from "zod";
import {
  parseMulti,
  serializePlatforms,
  serializeContentTypes,
} from "./taxonomy";

export const signupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(80),
  // Username is mandatory at signup: it's the public handle and the key the
  // referral system looks up (?ref=<username>), so it must be present and
  // well-formed. Uniqueness is enforced case-insensitively in the register API.
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be 30 characters or fewer")
    .regex(/^[a-zA-Z0-9_.]+$/, "Letters, numbers, _ and . only"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(100),
  role: z.enum(["creator", "brand"]).default("creator"),
});

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const forgotSchema = z.object({
  email: z.string().email("Enter a valid email"),
});

export const resetSchema = z.object({
  token: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters").max(100),
});

// A 6-digit email-verification code (the signup OTP flow). Trim, then require
// exactly six digits — the client already strips non-digits; this is the
// server-side guard.
export const verifyCodeSchema = z.object({
  email: z.string().email("Enter a valid email"),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code"),
});

export const submissionSchema = z.object({
  challengeId: z.string().min(1, "Missing challenge"),
  campaignId: z.string().optional().or(z.literal("")),
  platform: z.enum(["tiktok", "instagram", "youtube", "x"], {
    errorMap: () => ({ message: "Pick a platform" }),
  }),
  postUrl: z
    .string()
    .url("Enter a valid post link (https://…)")
    .max(500),
  caption: z.string().max(500).optional().or(z.literal("")),
});

export const campaignSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(100),
  brief: z.string().max(2000).optional().or(z.literal("")),
  // Multi-select: accepts a CSV string ("tiktok,instagram"), an array, or a
  // legacy single value ("tiktok"). Every token must be a known platform (an
  // unknown token 400s); the serializer then enforces "any" exclusivity so the
  // column never stores "any,tiktok". Empty input → the canonical "any".
  platform: z
    .preprocess(
      (v) => parseMulti(v),
      z.array(z.enum(["any", "tiktok", "instagram", "youtube", "x"]))
    )
    .transform((arr) => serializePlatforms(arr))
    .default("any"),
  reward: z.coerce.number().int().min(0).max(1000000).default(0),
  // Campaign economics — set by the brand at launch (GIMI-style).
  // budget = total pool ($); spotlightReward = bonus ($) for a spotlighted post;
  // performanceMult = the "x" multiplier; durationDays is how long the campaign
  // stays open — the API turns it into an `endsAt` timestamp for the countdown.
  budget: z.coerce.number().int().min(0).max(100000000).default(0),
  spotlightReward: z.coerce.number().int().min(0).max(1000000).default(0),
  // Empty/blank means "no multiplier" → default to ×1 (the number input is
  // pre-filled with "1" but can be cleared, which would otherwise fail min(1)).
  performanceMult: z.preprocess(
    (v) => (v === "" || v == null ? 1 : v),
    z.coerce.number().int().min(1).max(100)
  ).default(1),
  durationDays: z.coerce.number().int().min(1).max(365).optional().or(z.literal("")),
  // GIMI-style rich fields
  submitType: z.enum(["distribution", "source"]).default("distribution"),
  requirements: z.string().max(500).optional().or(z.literal("")),
  // Multi-select: a campaign accepts one or more content types (alternatives —
  // "ugc,ai" means a creator may submit EITHER). Accepts CSV/array/legacy single
  // value; at least one valid token is required. Absent → defaults to "ugc".
  contentType: z
    .preprocess(
      (v) => parseMulti(v),
      z
        .array(z.enum(["ugc", "edit", "ai", "open"]))
        .min(1, "Pick at least one content type")
    )
    .transform((arr) => serializeContentTypes(arr))
    .default("ugc"),
  assetsUrl: z.string().url("Enter a valid URL").max(500).optional().or(z.literal("")),
  visibility: z.enum(["public", "private"]).default("public"),
  showContributions: z.enum(["yes", "no"]).default("yes"),
  // Accept an https URL or an inline data: URL (uploaded/downscaled image).
  thumbnailUrl: z
    .string()
    .max(3_000_000)
    .refine((v) => v === "" || /^(https?:|data:image\/)/.test(v), "Invalid image")
    .optional()
    .or(z.literal("")),
  bannerUrl: z
    .string()
    .max(3_000_000)
    .refine((v) => v === "" || /^(https?:|data:image\/)/.test(v), "Invalid image")
    .optional()
    .or(z.literal("")),
  // Launch double-submit guard (§9). A wallet-funded launch sends a
  // client-generated UUID; a repeated POST with the same key returns the
  // already-created campaign instead of reserving its budget twice. Optional:
  // unfunded ($0) launches and the edit (PUT) path omit it.
  idempotencyKey: z.string().trim().min(8).max(64).optional().or(z.literal("")),
});

export const campaignStatusSchema = z.object({
  status: z.enum(["active", "paused", "ended"]),
});

// A brand adding money to its wallet. Whole dollars (USD), strictly positive —
// no negatives, no NaN, no fractional cents (§3/§18). Max mirrors the campaign
// funding cap. The amount is server-authoritative; the client value is only a
// hint until an admin confirms the top-up (§4/§5).
export const topUpSchema = z.object({
  amount: z.coerce
    .number()
    .int("Enter a whole dollar amount")
    .positive("Top-up amount must be greater than zero")
    .max(100000000, "That amount is too large"),
});

// A creator cashing out. amount is in whole dollars (min $10, max $1000).
// For stablecoin we require coin + network + a wallet address; for bank we
// require a payout email/reference as the destination.
export const withdrawalSchema = z
  .object({
    method: z.enum(["stablecoin", "bank"]).default("stablecoin"),
    amount: z.coerce.number().min(5, "Minimum withdrawal is $5").max(100, "Maximum withdrawal is $100"),
    coin: z.enum(["usdc"]).optional(),
    network: z.enum(["base", "ethereum"]).optional(),
    destination: z.string().min(3, "Enter a valid destination").max(200),
  })
  .superRefine((data, ctx) => {
    if (data.method === "stablecoin") {
      if (!data.coin) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["coin"], message: "Pick a stablecoin" });
      }
      if (!data.network) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["network"], message: "Pick a network" });
      }
      // Basic EVM wallet address check (0x + 40 hex chars).
      if (!/^0x[a-fA-F0-9]{40}$/.test(data.destination)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["destination"], message: "Enter a valid 0x wallet address" });
      }
    } else if (data.method === "bank") {
      // For bank/PayPal we accept an email as the destination.
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.destination)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["destination"], message: "Enter a valid payout email" });
      }
    }
  });

export const reviewSchema = z.object({
  submissionId: z.string().min(1, "Missing submission"),
  status: z.enum(["approved", "rejected", "pending"], {
    errorMap: () => ({ message: "Invalid status" }),
  }),
  reward: z.coerce.number().int().min(0).max(1000000).optional(),
  // Real metrics the admin verifies at review time (like GIMI moderators).
  // Rate is computed in-app as engagement / views * 100. Cap raised to 1e13
  // to match the bigint column's safe range (viral videos exceed 1e9).
  views: z.coerce.number().int().min(0).max(10000000000000).optional(),
  engagement: z.coerce.number().int().min(0).max(10000000000000).optional(),
  // Spotlight — admin highlights an outstanding post. The creator earns a
  // flexible bonus (whole dollars) that counts toward earnings + balance.
  // The client sends a real JSON boolean; avoid z.coerce.boolean() because it
  // turns the string "false" into true.
  spotlighted: z.boolean().optional(),
  spotlightBonus: z.coerce.number().int().min(0).max(1000000).optional(),
  // Optional free-text reason shown to the creator when a post is rejected.
  reason: z.string().trim().max(300).optional().or(z.literal("")),
});

// A direct message. `to` is the recipient's user id; body is the text.
export const messageSchema = z.object({
  to: z.string().min(1, "Missing recipient"),
  body: z.string().trim().min(1, "Write a message").max(2000, "Message is too long"),
});

// Follow/unfollow toggle. `userId` is the profile being followed/unfollowed.
export const followSchema = z.object({
  userId: z.string().min(1, "Missing user"),
});

export const profileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(80),
  username: z
    .string()
    .max(40)
    .regex(/^[a-zA-Z0-9_.]*$/, "Letters, numbers, _ and . only")
    .optional()
    .or(z.literal("")),
  bio: z.string().max(300).optional().or(z.literal("")),
  twitter: z.string().max(80).optional().or(z.literal("")),
  instagram: z.string().max(80).optional().or(z.literal("")),
  interests: z.string().max(200).optional().or(z.literal("")),
  // Accepts a normal https URL or an inline data: URL (uploaded/cropped photo).
  image: z
    .string()
    .max(2_000_000)
    .refine(
      (v) => v === "" || /^(https?:|data:image\/)/.test(v),
      "Enter a valid image URL"
    )
    .optional()
    .or(z.literal("")),
});

export const reportCreateSchema = z.object({
  reportedUserId: z.string().min(1),
  reportedUserType: z.enum(["creator", "brand"]),
  reason: z.string().min(1).max(80),
  description: z.string().trim().min(10, "Add at least 10 characters").max(3000),
  evidence: z.string().url("Enter a valid evidence URL").max(500).optional().or(z.literal("")),
});

export const reportUpdateSchema = z.object({
  action: z.enum(["assign", "status", "priority", "request_info", "resolve", "dismiss"]),
  assignedAdminId: z.string().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  status: z.enum(["open", "under_review", "awaiting_response"]).optional(),
  resolution: z.string().max(100).optional(),
  resolutionNote: z.string().trim().max(3000).optional(),
});

export const reportResponseSchema = z.object({
  message: z.string().trim().min(10, "Add at least 10 characters").max(3000),
  evidence: z.string().url("Enter a valid evidence URL").max(500).optional().or(z.literal("")),
});

export const moderationActionSchema = z.object({
  targetUserId: z.string().min(1),
  action: z.enum(["warning", "suspension", "ban", "unban", "moderation_note"]),
  reason: z.string().trim().min(3, "A reason is required").max(300),
  note: z.string().trim().min(3, "A note is required").max(3000),
  durationHours: z.coerce.number().int().min(1).max(8760).optional(),
  relatedReportId: z.string().max(200).optional().or(z.literal("")),
  relatedCampaignId: z.string().max(200).optional().or(z.literal("")),
}).superRefine((data, ctx) => {
  if (data.action === "suspension" && !data.durationHours) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["durationHours"], message: "A suspension duration is required" });
  }
});

export const trustReviewSchema = z.object({
  campaignId: z.string().min(1, "Missing campaign"),
  revieweeId: z.string().min(1, "Missing review recipient"),
  rating: z.coerce.number().int().min(1, "Choose a rating from 1 to 5").max(5),
  comment: z.string().trim().min(10, "Write at least 10 characters").max(2000),
});

const safeUrl = z.string().url("Enter a valid https URL").max(500).refine((v) => /^https:\/\//i.test(v), "Use an https URL");
export const portfolioSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  category: z.string().trim().max(80).optional().or(z.literal("")),
  thumbnailUrl: safeUrl.optional().or(z.literal("")),
  workUrl: safeUrl,
  platform: z.enum(["instagram", "tiktok", "youtube", "x", "website", "other"]).optional().or(z.literal("")),
  displayOrder: z.coerce.number().int().min(0).max(1000).optional(),
});

export const socialLinkSchema = z.object({
  platform: z.enum(["instagram", "tiktok", "youtube", "x", "facebook", "linkedin", "website"]),
  url: safeUrl,
});

export const campaignFundingSchema = z.object({
  amount: z.coerce.number().int().positive("Funding amount must be greater than zero").max(100000000),
  reference: z.string().trim().min(3, "A verified funding reference is required").max(200),
  note: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const verificationSchema = z.object({
  targetUserId: z.string().min(1),
  action: z.enum(["verify", "unverify"]),
});

export const reviewModerationSchema = z.object({
  action: z.enum(["hide", "restore"]),
  note: z.string().trim().min(3, "A moderation note is required").max(1000),
});

// Content categories offered on the Ambassador application. Kept in sync with
// the select in components/AmbassadorForm.js.
export const AMBASSADOR_CATEGORIES = [
  "technology",
  "gaming",
  "lifestyle",
  "beauty",
  "education",
  "business",
  "entertainment",
  "fitness",
  "other",
];

// Where applicants heard about PulseFy (optional). Slugs; labels live in the UI.
export const AMBASSADOR_REFERRAL_SOURCES = [
  "search",
  "social",
  "friend",
  "creator",
  "event",
  "other",
];

// Public "Become an Ambassador" application (no account required). Captures
// who they are, where their audience lives, and why they'd be a good fit.
// country/socialLink/category/referralSource are the fields added in the
// program upgrade; `agree` is the required guidelines acceptance.
export const ambassadorSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  email: z.string().trim().email("Enter a valid email"),
  country: z.string().trim().min(2, "Tell us where you're based").max(60),
  platform: z.enum(["tiktok", "instagram", "youtube", "x", "other"], {
    errorMap: () => ({ message: "Pick your main platform" }),
  }),
  handle: z.string().trim().min(2, "Enter your handle or channel").max(120),
  socialLink: z
    .string()
    .trim()
    .url("Enter a valid link (https://…)")
    .max(300)
    .optional()
    .or(z.literal("")),
  followers: z.enum(["0-1k", "1k-10k", "10k-50k", "50k-250k", "250k+"], {
    errorMap: () => ({ message: "Pick your audience size" }),
  }),
  category: z.enum(AMBASSADOR_CATEGORIES, {
    errorMap: () => ({ message: "Pick a content category" }),
  }),
  referralSource: z
    .enum(AMBASSADOR_REFERRAL_SOURCES)
    .optional()
    .or(z.literal("")),
  pitch: z
    .string()
    .trim()
    .min(30, "Tell us a bit more (at least 30 characters)")
    .max(2000, "Keep it under 2000 characters"),
  // Must be checked — the program has community guidelines. z.literal(true)
  // rejects a missing/false value with this message.
  agree: z.literal(true, {
    errorMap: () => ({
      message: "Please agree to the Ambassador Program guidelines to continue",
    }),
  }),
});

// Admin review of an Ambassador application. Only these three transitions are
// allowed from the admin console; an optional private note may accompany them.
export const ambassadorReviewSchema = z.object({
  status: z.enum(["under_review", "approved", "rejected"], {
    errorMap: () => ({ message: "Invalid status" }),
  }),
  reviewerNote: z.string().trim().max(2000).optional().or(z.literal("")),
});
