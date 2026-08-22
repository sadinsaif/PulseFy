export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { db } from "@/db";
import { submissions, campaigns } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import Sidebar from "@/components/Sidebar";
import MyApplications from "@/components/MyApplications";
import { isAdminEmail } from "@/lib/admin";

/**
 * /dashboard/my-applications — a creator's own view of every campaign they've
 * applied to (i.e. submitted a clip to), with status. Read-only: approvals are
 * the brand's job. Brands/admins get a friendly stub so nothing leaks and the
 * brand UI is untouched.
 */
export default async function MyApplicationsPage() {
  const session = await auth();
  const user = session?.user;
  const admin = isAdminEmail(user?.email);
  const isBrand = user?.role === "brand";

  if (isBrand || admin) {
    return (
      <div className="app">
        <Sidebar user={user} isAdmin={admin} />
        <main className="main">
          <div className="topbar">
            <div>
              <h1>My Applications</h1>
              <p className="sub">This area is for creators.</p>
            </div>
          </div>
          <section className="panel">
            <p className="brief">
              This page tracks the campaigns a creator has applied to. Brands can
              review incoming submissions from <b>Applications</b>.
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
        id: submissions.id,
        campaignId: submissions.campaignId,
        challengeId: submissions.challengeId,
        campaignTitle: campaigns.title,
        campaignReward: campaigns.reward,
        platform: submissions.platform,
        postUrl: submissions.postUrl,
        reward: submissions.reward,
        status: submissions.status,
        rejectionReason: submissions.rejectionReason,
        createdAt: submissions.createdAt,
      })
      .from(submissions)
      .leftJoin(campaigns, eq(submissions.campaignId, campaigns.id))
      .where(eq(submissions.userId, user.id))
      .orderBy(desc(submissions.createdAt));

    // Serialize dates for the client component.
    rows = raw.map((r) => ({
      ...r,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
    }));
  } catch {
    rows = [];
  }

  return (
    <div className="app">
      <Sidebar user={user} isAdmin={false} />
      <main className="main">
        <div className="topbar">
          <div>
            <h1>My Applications</h1>
            <p className="sub">
              Every campaign you&apos;ve applied to and where each one stands.
            </p>
          </div>
        </div>

        <MyApplications rows={rows} />
      </main>
    </div>
  );
}
