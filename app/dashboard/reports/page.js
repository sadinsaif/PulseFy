export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import Sidebar from "@/components/Sidebar";
import AdminReports from "@/components/AdminReports";
import AdminAuditLog from "@/components/AdminAuditLog";
import ReporterReports from "@/components/ReporterReports";
import { isAdminEmail } from "@/lib/admin";

/**
 * /dashboard/reports — Reports & Disputes. Admins get the full moderation queue
 * (AdminReports) plus the audit log; everyone else sees their own private report
 * history (ReporterReports). Backed by the real reports/report_events tables
 * (migration 010) — this is live, not a placeholder.
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
