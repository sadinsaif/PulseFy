export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import Sidebar from "@/components/Sidebar";
import CreatorProfile from "@/components/CreatorProfile";
import { isAdminEmail } from "@/lib/admin";

/**
 * Public profile page for any creator, reached by clicking a creator anywhere
 * in the app. Renders the real, DB-backed profile via <CreatorProfile />.
 */
export default async function CreatorPage({ params }) {
  const session = await auth();
  const user = session?.user;

  return (
    <div className="app">
      <Sidebar user={user} isAdmin={isAdminEmail(user?.email)} />
      <main className="main">
        <CreatorProfile id={params.id} />
      </main>
    </div>
  );
}
