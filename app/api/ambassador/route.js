export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { ambassadorApplications } from "@/db/schema";
import { and, or, eq, inArray, desc } from "drizzle-orm";
import { ambassadorSchema } from "@/lib/validation";
import { getAdminEmails } from "@/lib/admin";
import { sendAmbassadorApplication } from "@/lib/email";
import { notifyAdmins } from "@/lib/notify";

// An application blocks a new one while it is in one of these states. A
// 'rejected' (or 'draft') application does not, so an applicant can re-apply.
const ACTIVE_STATUSES = ["submitted", "under_review", "approved"];

// Postgres "undefined_table" — thrown until migration 017 is applied on Neon.
// Vercel/Neon surfaces the code on the error or its cause.
function isMissingTable(err) {
  return err?.code === "42P01" || err?.cause?.code === "42P01";
}

/** Best-effort notification to the PulseFy team — never blocks the applicant. */
async function notifyTeam(application) {
  const admins = getAdminEmails();
  if (admins.length && process.env.RESEND_API_KEY) {
    try {
      await sendAmbassadorApplication(admins, application);
    } catch (err) {
      console.error("Ambassador notification email failed:", err);
    }
  } else if (!admins.length) {
    console.info("Ambassador application (no admin email configured):", application);
  }
  await notifyAdmins({
    type: "submission",
    message: `New Ambassador application — ${application.name} (${application.platform}).`,
    link: null,
  });
}

/**
 * POST /api/ambassador
 * Public Ambassador Program application. Persists to ambassador_applications,
 * attaching the signed-in user's id when present (nullable otherwise). Enforces
 * one active application per account/email, and notifies the admin inbox.
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

  // Session is optional — the page is public. auth() returns id:null for a
  // moderation-blocked account, which we treat as anonymous here.
  let userId = null;
  try {
    const session = await auth();
    userId = session?.user?.id || null;
  } catch {
    userId = null;
  }

  const application = {
    userId,
    name: parsed.data.name.trim(),
    email: parsed.data.email.toLowerCase().trim(),
    country: parsed.data.country.trim(),
    platform: parsed.data.platform,
    handle: parsed.data.handle.trim(),
    socialLink: parsed.data.socialLink?.trim() || null,
    audienceSize: parsed.data.followers,
    contentCategory: parsed.data.category,
    reason: parsed.data.pitch.trim(),
    referralSource: parsed.data.referralSource || null,
  };

  try {
    // Friendly duplicate check before insert (the partial-unique indexes are
    // the race-safe backstop below). Match the account when signed in, and
    // always match the email.
    const existing = await db
      .select({ status: ambassadorApplications.status, submittedAt: ambassadorApplications.submittedAt })
      .from(ambassadorApplications)
      .where(
        and(
          inArray(ambassadorApplications.status, ACTIVE_STATUSES),
          userId
            ? or(eq(ambassadorApplications.userId, userId), eq(ambassadorApplications.email, application.email))
            : eq(ambassadorApplications.email, application.email)
        )
      )
      .orderBy(desc(ambassadorApplications.submittedAt))
      .limit(1);

    if (existing[0]) {
      return NextResponse.json(
        {
          error: "You already have an active Ambassador application.",
          duplicate: true,
          application: existing[0],
        },
        { status: 409 }
      );
    }

    const [row] = await db
      .insert(ambassadorApplications)
      // A submitted application immediately enters the review queue, so its
      // real, stored status is "under_review" from the start — no fake dates
      // or approval info are ever invented.
      .values({ ...application, status: "under_review" })
      .returning({
        id: ambassadorApplications.id,
        status: ambassadorApplications.status,
        submittedAt: ambassadorApplications.submittedAt,
      });

    await notifyTeam(application);

    return NextResponse.json(
      {
        ok: true,
        application: row,
        message:
          "Thanks! Your Ambassador application is in. Our team reviews every application personally and will reach out by email.",
      },
      { status: 201 }
    );
  } catch (err) {
    // Unique-violation race → an active application already exists.
    if (err?.code === "23505" || err?.cause?.code === "23505") {
      return NextResponse.json(
        { error: "You already have an active Ambassador application.", duplicate: true },
        { status: 409 }
      );
    }
    // Migration 017 not applied yet: don't lose the application — fall back to
    // the notify-only path so the team still hears about it.
    if (isMissingTable(err)) {
      await notifyTeam(application);
      return NextResponse.json({
        ok: true,
        message:
          "Thanks! Your Ambassador application is in. Our team will reach out by email.",
      });
    }
    console.error("Ambassador application failed:", err);
    return NextResponse.json(
      { error: "Could not submit your application. Please try again." },
      { status: 500 }
    );
  }
}
