export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import Sidebar from "@/components/Sidebar";
import AdminReports from "@/components/AdminReports";
import AdminAuditLog from "@/components/AdminAuditLog";
import ReporterReports from "@/components/ReporterReports";
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
              <p className="sub">Your private report history.</p>
            </div>
          </div>
          <section className="panel"><ReporterReports /></section>
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

        <section className="panel"><AdminReports /></section>
        <AdminAuditLog />
      </main>
    </div>
  );
}
