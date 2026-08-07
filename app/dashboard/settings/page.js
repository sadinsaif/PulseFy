export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import Sidebar from "@/components/Sidebar";
import ThemeToggle from "@/components/ThemeToggle";
import { isAdminEmail } from "@/lib/admin";

/**
 * Settings — currently houses the Appearance (light/dark) control.
 * Matches the other dashboard pages: server component that renders the
 * shared Sidebar + a .main column.
 */
export default async function SettingsPage() {
  const session = await auth();
  const user = session?.user;
  const admin = isAdminEmail(user?.email);

  return (
    <div className="app">
      <Sidebar user={user} isAdmin={admin} />
      <main className="main">
        <div className="topbar">
          <div>
            <h1>Settings</h1>
            <p className="sub">Manage how Pulsefy looks and feels.</p>
          </div>
        </div>

        <section className="settings-card">
          <div className="settings-row">
            <div className="settings-row-txt">
              <h3>Appearance</h3>
              <p>
                Choose a light or dark theme. Your choice is saved on this
                device and used every time you return.
              </p>
            </div>
            <ThemeToggle />
          </div>
        </section>
      </main>
    </div>
  );
}
