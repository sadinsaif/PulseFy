export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { db } from "@/db";
import { ambassadorApplications } from "@/db/schema";
import { desc } from "drizzle-orm";
import Sidebar from "@/components/Sidebar";
import AdminAmbassadors from "@/components/AdminAmbassadors";
import { isAdminEmail } from "@/lib/admin";

/**
 * /dashboard/ambassadors — admin-only Ambassador Program console. Lists every
 * application (newest first) and lets an admin Approve / Reject / re-open under
 * review. Non-admins get the same friendly "for admins" stub the other
 * admin-only surfaces use, so nothing leaks and no creator/brand route breaks.
 * Reads only real rows from ambassador_applications — no fake data. Fails soft
 * to an empty list if migration 017 hasn't been applied yet.
 */
export default async function AmbassadorsPage() {
  const session = await auth();
  const user = session?.user;
  const admin = isAdminEmail(user?.email);

  if (!admin) {
    return (
      <div className="app">
        <Sidebar user={user} isAdmin={false} />
        <main className="main">
          <div className="topbar">
            <div>
              <h1>Ambassadors</h1>
              <p className="sub">This area is for platform admins.</p>
            </div>
          </div>
          <section className="panel">
            <p className="brief" style={{ marginTop: 4 }}>
              You don&apos;t have access to Ambassador applications.
            </p>
          </section>
        </main>
      </div>
    );
  }

  let rows = [];
  try {
    const raw = await db
      .select({
        id: ambassadorApplications.id,
        userId: ambassadorApplications.userId,
        name: ambassadorApplications.name,
        email: ambassadorApplications.email,
        country: ambassadorApplications.country,
        platform: ambassadorApplications.platform,
        handle: ambassadorApplications.handle,
        socialLink: ambassadorApplications.socialLink,
        audienceSize: ambassadorApplications.audienceSize,
        contentCategory: ambassadorApplications.contentCategory,
        reason: ambassadorApplications.reason,
        referralSource: ambassadorApplications.referralSource,
        status: ambassadorApplications.status,
        reviewerNote: ambassadorApplications.reviewerNote,
        submittedAt: ambassadorApplications.submittedAt,
        reviewedAt: ambassadorApplications.reviewedAt,
      })
      .from(ambassadorApplications)
      .orderBy(desc(ambassadorApplications.submittedAt));

    // Serialize dates for the client component (plain props only).
    rows = raw.map((r) => ({
      ...r,
      submittedAt: r.submittedAt ? new Date(r.submittedAt).toISOString() : null,
      reviewedAt: r.reviewedAt ? new Date(r.reviewedAt).toISOString() : null,
    }));
  } catch {
    rows = [];
  }

  return (
    <div className="app">
      <Sidebar user={user} isAdmin={admin} />
      <main className="main">
        <div className="topbar">
          <div>
            <h1>Ambassadors</h1>
            <p className="sub">
              Every Ambassador Program application — review, approve or decline.
            </p>
          </div>
        </div>

        <AdminAmbassadors initialRows={rows} />
      </main>
    </div>
  );
}
