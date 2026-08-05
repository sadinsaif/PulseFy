export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import Sidebar from "@/components/Sidebar";
import ReviewBoard from "@/components/ReviewBoard";
import { isAdminEmail } from "@/lib/admin";

export default async function SubmissionsPage() {
  const session = await auth();
  const user = session?.user;
  const admin = isAdminEmail(user?.email);
  const isBrand = user?.role === "brand";
  const canReview = admin || isBrand;

  if (!canReview) {
    return (
      <div className="app">
        <Sidebar user={user} isAdmin={admin} />
        <main className="main">
          <div className="topbar">
            <div>
              <h1>Submissions</h1>
              <p className="sub">This area is for brands and admins.</p>
            </div>
          </div>
          <section className="panel">
            <p className="brief">
              Creators don&apos;t review submissions. Head to{" "}
              <b>Campaigns</b> to submit your clips.
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
              {admin
                ? "Review creator submissions across all campaigns. Open a post, then approve or reject it."
                : "Review clips submitted to your campaigns. Set a reward, then approve or reject."}
            </p>
          </div>
        </div>

        <section className="panel">
          <div className="panel-head">
            <h3>{admin ? "All submissions" : "Your campaign submissions"}</h3>
          </div>
          <ReviewBoard />
        </section>
      </main>
    </div>
  );
}
