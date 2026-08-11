export const dynamic = "force-dynamic";

import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/db";
import { ambassadorApplications } from "@/db/schema";
import { and, eq, inArray, desc } from "drizzle-orm";
import Navbar from "@/components/Navbar";
import AmbassadorForm from "@/components/AmbassadorForm";

export const metadata = {
  title: "Become an Ambassador · PulseFy",
  description:
    "Join the PulseFy Ambassador Program. Bring creators and brands into the AI creator economy, unlock exclusive perks, and earn on every referral.",
};

// A signed-in applicant's active application blocks re-applying. Look it up so
// we can show its real status instead of the form again. Fails soft (returns
// null) if migration 017 hasn't been applied yet.
async function getActiveApplication(userId) {
  if (!userId) return null;
  try {
    const rows = await db
      .select({
        status: ambassadorApplications.status,
        submittedAt: ambassadorApplications.submittedAt,
        reviewedAt: ambassadorApplications.reviewedAt,
      })
      .from(ambassadorApplications)
      .where(
        and(
          eq(ambassadorApplications.userId, userId),
          inArray(ambassadorApplications.status, ["submitted", "under_review", "approved"])
        )
      )
      .orderBy(desc(ambassadorApplications.submittedAt))
      .limit(1);
    return rows[0] || null;
  } catch (err) {
    console.error("Ambassador status lookup failed:", err);
    return null;
  }
}

export default async function AmbassadorPage() {
  const session = await auth();
  const existingApplication = await getActiveApplication(session?.user?.id);

  return (
    <>
      <Navbar session={session} />

      <AmbassadorForm existingApplication={existingApplication} />

      {/* FOOTER — mirrors the landing page for a consistent public shell */}
      <footer className="footer">
        <div className="container">
          <div className="footer-grid">
            <div className="footer-brand">
              <Link href="/" className="logo">
                <span className="logo-mark" aria-hidden="true" />
                <span className="wordmark">Pulse<span className="wm-fy">Fy</span></span>
              </Link>
              <p>Infrastructure for the AI creator economy. From brief to payout — automated.</p>
            </div>
            <div className="footer-col">
              <h4>Product</h4>
              <a href="/#features">Features</a>
              <a href="/#pricing">Pricing</a>
              <Link href="/dashboard">Dashboard</Link>
              <Link href="/ambassador">Ambassadors</Link>
            </div>
            <div className="footer-col">
              <h4>Company</h4>
              <a href="#">About</a>
              <a href="#">Blog</a>
              <a href="#">Careers</a>
              <a href="#">Contact</a>
            </div>
            <div className="footer-col">
              <h4>Legal</h4>
              <a href="#">Privacy</a>
              <a href="#">Terms</a>
              <a href="#">Compliance</a>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© 2026 PulseFy. All rights reserved.</span>
            <span>Made for creators &amp; brands.</span>
          </div>
        </div>
      </footer>
    </>
  );
}
