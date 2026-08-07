export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import Sidebar from "@/components/Sidebar";
import Inbox from "@/components/Inbox";
import { isAdminEmail } from "@/lib/admin";

/**
 * Inbox — 1-on-1 direct messages between users. The two-pane <Inbox /> shows
 * your conversations on the left and the open thread + composer on the right.
 * A ?to=<userId> query opens (or starts) that conversation on load.
 */
export default async function InboxPage({ searchParams }) {
  const session = await auth();
  const user = session?.user;
  const initialTo = typeof searchParams?.to === "string" ? searchParams.to : "";

  return (
    <div className="app">
      <Sidebar user={user} isAdmin={isAdminEmail(user?.email)} />
      <main className="main">
        <div className="topbar">
          <div>
            <h1>Inbox</h1>
            <p className="sub">Message creators directly — replies land here.</p>
          </div>
        </div>
        <Inbox meId={user?.id || ""} initialTo={initialTo} />
      </main>
    </div>
  );
}
