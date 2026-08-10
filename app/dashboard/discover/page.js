export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import Sidebar from "@/components/Sidebar";
import DiscoverCreators from "@/components/DiscoverCreators";
import { isAdminEmail } from "@/lib/admin";

/**
 * /dashboard/discover — brand-only creator discovery. Non-brand/admin users get
 * a friendly stub (mirrors the Submissions page), so no creator data leaks and
 * the creator experience is untouched.
 */
export default async function DiscoverPage() {
  const session = await auth();
  const user = session?.user;
  const admin = isAdminEmail(user?.email);
  const [currentUser] = user?.id
    ? await db.select({ role: users.role }).from(users).where(eq(users.id, user.id))
    : [];
  const effectiveUser = user ? { ...user, role: currentUser?.role || user.role } : user;
  const isBrand = currentUser?.role === "brand";

  if (!isBrand && !admin) {
    return (
      <div className="app">
        <Sidebar user={effectiveUser} isAdmin={admin} />
        <main className="main">
          <div className="topbar">
            <div>
              <h1>Discover Creators</h1>
              <p className="sub">This area is for brands.</p>
            </div>
          </div>
          <section className="panel">
            <p className="brief">
              Creator discovery is for brands looking to hire. Head to{" "}
              <b>Campaigns</b> to find work and submit your clips.
            </p>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <Sidebar user={effectiveUser} isAdmin={admin} />

      <main className="main">
        <div className="topbar">
          <div>
            <h1>Discover Creators</h1>
            <p className="sub">
              Find creators by platform, reach and engagement — then invite them to a campaign.
            </p>
          </div>
        </div>

        <DiscoverCreators />
      </main>
    </div>
  );
}
