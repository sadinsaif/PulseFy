export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import Sidebar from "@/components/Sidebar";
import Applications from "@/components/Applications";
import { isAdminEmail } from "@/lib/admin";

/**
 * /dashboard/applications — brand-only. A brand-framed view of the content
 * creators have submitted to the brand's campaigns (fed by the existing,
 * brand-scoped /api/review). Approve / reject moves the submission through the
 * real review pipeline; Message opens the inbox thread. Non-brand/admin users
 * get a friendly stub so no data leaks.
 */
export default async function ApplicationsPage() {
  const session = await auth();
  const user = session?.user;
  const admin = isAdminEmail(user?.email);
  const isBrand = user?.role === "brand";

  if (!isBrand && !admin) {
    return (
      <div className="app">
        <Sidebar user={user} isAdmin={admin} />
        <main className="main">
          <div className="topbar">
            <div>
              <h1>Applications</h1>
              <p className="sub">This area is for brands.</p>
            </div>
          </div>
          <section className="panel">
            <p className="brief">
              Applications are for brands reviewing creator submissions. Head to{" "}
              <b>Campaigns</b> to find work and submit your clips.
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
            <h1>Applications</h1>
            <p className="sub">
              Creators who submitted to your campaigns. Approve the ones that fit, reject the rest, or message a creator.
            </p>
          </div>
        </div>

        <section className="panel">
          <Applications />
        </section>
      </main>
    </div>
  );
}
