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
    amount: z.coerce.number().min(10, "Minimum withdrawal is $10").max(1000, "Maximum withdrawal is $1000"),
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
