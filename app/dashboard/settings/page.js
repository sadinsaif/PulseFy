export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import Sidebar from "@/components/Sidebar";
import { isAdminEmail } from "@/lib/admin";

/**
 * /dashboard/settings — admin settings (admin only). Future-ready shell: shows
 * the current admin identity and read-only platform info. No writes yet — there
 * is no settings table, so nothing here mutates state (per the agreed scope we
 * don't invent a fake settings backend).
 */
export default async function SettingsPage() {
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
              <h1>Settings</h1>
              <p className="sub">This area is for admins.</p>
            </div>
          </div>
          <section className="panel">
            <p className="brief">You don&apos;t have access to this page.</p>
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
            <h1>Settings</h1>
            <p className="sub">Admin account and platform configuration.</p>
          </div>
        </div>

        <section className="panel">
          <div className="panel-head">
            <h3>Admin account</h3>
          </div>
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table>
              <tbody>
                <tr>
                  <td style={{ opacity: 0.7 }}>Signed in as</td>
                  <td style={{ textAlign: "right" }}><b>{user?.name || "Admin"}</b></td>
                </tr>
                <tr>
                  <td style={{ opacity: 0.7 }}>Email</td>
                  <td style={{ textAlign: "right" }}>{user?.email || "—"}</td>
                </tr>
                <tr>
                  <td style={{ opacity: 0.7 }}>Access level</td>
                  <td style={{ textAlign: "right" }}>
                    <span className="status live">Platform admin</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel" style={{ marginTop: 18 }}>
          <div className="panel-head">
            <h3>Platform configuration</h3>
          </div>
          <p className="brief" style={{ marginTop: 10 }}>
            Configurable platform settings (fees, payout thresholds, branding)
            will appear here. This section is ready for those controls — nothing
            is editable yet, so the live platform behaviour is unchanged.
          </p>
        </section>
      </main>
    </div>
  );
}
