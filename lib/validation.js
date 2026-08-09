import { z } from "zod";

export const signupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(80),
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
  platform: z
    .enum(["any", "tiktok", "instagram", "youtube", "x"])
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
  contentType: z.enum(["ugc", "edit", "ai", "open"]).default("ugc"),
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
});

export const campaignStatusSchema = z.object({
  status: z.enum(["active", "paused", "ended"]),
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
