import { z } from "zod";

export const signupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(80),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(100),
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
  platform: z.enum(["tiktok", "instagram", "youtube", "x"], {
    errorMap: () => ({ message: "Pick a platform" }),
  }),
  postUrl: z
    .string()
    .url("Enter a valid post link (https://…)")
    .max(500),
  caption: z.string().max(500).optional().or(z.literal("")),
});

export const reviewSchema = z.object({
  submissionId: z.string().min(1, "Missing submission"),
  status: z.enum(["approved", "rejected", "pending"], {
    errorMap: () => ({ message: "Invalid status" }),
  }),
});
