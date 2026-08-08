export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import Sidebar from "@/components/Sidebar";
import { isAdminEmail } from "@/lib/admin";

/**
 * /dashboard/reports — Reports & Disputes (admin only). Future-ready shell:
 * no reporting/dispute tables exist yet, so this renders a real admin layout
 * with a clear "coming soon" empty-state rather than any fake data or actions.
 */
export default async function ReportsPage() {
  const session = await auth();
  const user = session?.user;
  const admin = isAdminEmail(user?.email);

  if (!admin) {
    return (
      <div className="app">
        <Sidebar user={user} isAdmin={admin} />
        <main className="main">
          <div className="topbar">
            <div>
              <h1>Reports &amp; Disputes</h1>
              <p className="sub">This area is for admins.</p>
            </div>
          </div>
          <section className="panel">
            <p className="brief">
              You don&apos;t have access to this page.
            </p>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <Sidebar user={user} isAdmin={admin} />
      <main className="main">
        <div className="topbar">
          <div>
            <h1>Reports &amp; Disputes</h1>
            <p className="sub">
              Moderation queue for reported content and creator–brand disputes.
            </p>
          </div>
        </div>

        <section className="panel">
          <div className="panel-head">
            <h3>Nothing to review</h3>
          </div>
          <p className="brief" style={{ marginTop: 10 }}>
            There are no open reports or disputes right now. When users can flag
            content or raise a dispute, those cases will land here for you to
            review and resolve. This section is ready for that tooling.
          </p>
        </section>
      </main>
    </div>
  );
}
