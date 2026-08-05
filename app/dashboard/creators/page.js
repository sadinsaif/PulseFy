export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import Sidebar from "@/components/Sidebar";
import CreatorsDirectory from "@/components/CreatorsDirectory";
import { isAdminEmail } from "@/lib/admin";

/**
 * Discover page — search any creator by name/username, then click through to
 * their public profile.
 */
export default async function CreatorsPage() {
  const session = await auth();
  const user = session?.user;

  return (
    <div className="app">
      <Sidebar user={user} isAdmin={isAdminEmail(user?.email)} />
      <main className="main">
        <div className="topbar">
          <div>
            <h1>Discover creators</h1>
            <p className="sub">Search any creator, view their profile, clips &amp; earnings.</p>
          </div>
        </div>
        <CreatorsDirectory />
      </main>
    </div>
  );
}
