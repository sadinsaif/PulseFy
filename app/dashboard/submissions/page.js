export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import Sidebar from "@/components/Sidebar";
import ReviewBoard from "@/components/ReviewBoard";
import { isAdminEmail } from "@/lib/admin";

export default async function SubmissionsPage() {
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
              <h1>Submissions</h1>
              <p className="sub">This area is for admins only.</p>
            </div>
          </div>
          <section className="panel">
            <p className="brief">
              You don&apos;t have access to review submissions.
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
            <h1>Submissions</h1>
            <p className="sub">
              Review creator submissions across all challenges. Open a post,
              then approve or reject it.
            </p>
          </div>
        </div>

        <section className="panel">
          <div className="panel-head">
            <h3>All submissions</h3>
          </div>
          <ReviewBoard />
        </section>
      </main>
    </div>
  );
}
