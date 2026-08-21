export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { ambassadorApplications } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ambassadorReviewSchema } from "@/lib/validation";
import { isAdminEmail } from "@/lib/admin";
import { notifyUser } from "@/lib/notify";
import { sendAmbassadorApprovalEmail } from "@/lib/email";

// A friendly, applicant-facing line for each decision (in-app notification).
const DECISION_MESSAGE = {
  approved: "🎉 You've been approved as a PulseFy Ambassador! Check your email for next steps.",
  rejected: "Your PulseFy Ambassador application was reviewed and wasn't selected this time.",
  under_review: "Your PulseFy Ambassador application is under review.",
};

/**
 * PATCH /api/ambassador/[id] — admin-only review action. Sets the application's
 * status (under_review | approved | rejected), stamps the real review time and
 * reviewer, stores an optional private note, and notifies the applicant in-app
 * when their account is known. No fake dates: reviewedAt is only set on a final
 * decision and cleared if the application is put back under review.
 */
export async function PATCH(req, { params }) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = ambassadorReviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }

  const { status, reviewerNote } = parsed.data;

  try {
    const [existing] = await db
      .select({
        id: ambassadorApplications.id,
        userId: ambassadorApplications.userId,
        email: ambassadorApplications.email,
        name: ambassadorApplications.name,
        status: ambassadorApplications.status,
      })
      .from(ambassadorApplications)
      .where(eq(ambassadorApplications.id, params.id));

    if (!existing) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    const isDecision = status === "approved" || status === "rejected";
    const [row] = await db
      .update(ambassadorApplications)
      .set({
        status,
        reviewerId: session.user.id || null,
        reviewerNote: reviewerNote || null,
        // Real review timestamp on a final decision; cleared when re-opened.
        reviewedAt: isDecision ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(ambassadorApplications.id, params.id))
      .returning({
        id: ambassadorApplications.id,
        status: ambassadorApplications.status,
        reviewerNote: ambassadorApplications.reviewerNote,
        reviewedAt: ambassadorApplications.reviewedAt,
      });

    // Let the applicant know in-app (only when we have their account).
    if (existing.userId) {
      await notifyUser(existing.userId, {
        type: "ambassador",
        message: DECISION_MESSAGE[status] || "Your Ambassador application was updated.",
        link: "/ambassador",
      });
    }

    // Email the applicant when they're newly approved (best-effort). The email
    // lives on the application row, so this works even without an account, and a
    // mail failure must never fail the review that already succeeded above.
    if (status === "approved" && existing.status !== "approved" && existing.email && process.env.RESEND_API_KEY) {
      try {
        const base = process.env.AUTH_URL || process.env.NEXTAUTH_URL || new URL(req.url).origin;
        await sendAmbassadorApprovalEmail(existing.email, {
          name: existing.name,
          url: `${base}/ambassador`,
        });
      } catch (err) {
        console.error("Ambassador approval email failed:", err);
      }
    }

    return NextResponse.json({ ok: true, application: row });
  } catch (err) {
    console.error("Ambassador review failed:", err);
    return NextResponse.json({ error: "Could not update the application." }, { status: 500 });
  }
}
