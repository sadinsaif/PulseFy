export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import Sidebar from "@/components/Sidebar";
import ReviewBoard from "@/components/ReviewBoard";

export default async function SubmissionsPage() {
  const session = await auth();
  const user = session?.user;

  return (
    <div className="app">
      <Sidebar user={user} />

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
