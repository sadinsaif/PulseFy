export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ambassadorSchema } from "@/lib/validation";
import { getAdminEmails } from "@/lib/admin";
import { sendAmbassadorApplication } from "@/lib/email";

/**
 * POST /api/ambassador
 * Public Ambassador Program application. Validates the payload and emails the
 * configured admin inbox (ADMIN_EMAIL) via the existing Resend integration.
 *
 * There's no ambassadors table (by design — no schema change), so this is a
 * notify-only endpoint. If email isn't configured we still return success so
 * the applicant gets a clean confirmation; the failure is logged server-side.
 */
export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = ambassadorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }

  const app = {
    name: parsed.data.name.trim(),
    email: parsed.data.email.toLowerCase().trim(),
    platform: parsed.data.platform,
    handle: parsed.data.handle.trim(),
    followers: parsed.data.followers,
    pitch: parsed.data.pitch.trim(),
  };

  const admins = getAdminEmails();
  if (admins.length && process.env.RESEND_API_KEY) {
    try {
      await sendAmbassadorApplication(admins, app);
    } catch (err) {
      // Don't fail the applicant's submission if the notification email
      // bounces — log it so we can follow up manually.
      console.error("Ambassador notification email failed:", err);
    }
  } else {
    // Nothing wired up yet — record it in the server logs so nothing is lost.
    console.info("Ambassador application (no email configured):", app);
  }

  return NextResponse.json({
    ok: true,
    message:
      "Thanks! Your Ambassador application is in. Our team will reach out by email.",
  });
}
