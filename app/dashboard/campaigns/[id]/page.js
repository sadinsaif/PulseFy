export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import Sidebar from "@/components/Sidebar";
import CampaignDetail from "@/components/CampaignDetail";
import { isAdminEmail } from "@/lib/admin";

export default async function CampaignDetailPage({ params }) {
  const session = await auth();
  const user = session?.user;
  const [currentUser] = user?.id
    ? await db.select({ role: users.role }).from(users).where(eq(users.id, user.id))
    : [];
  const effectiveUser = user ? { ...user, role: currentUser?.role || user.role } : user;

  return (
    <div className="app">
      <Sidebar user={effectiveUser} isAdmin={isAdminEmail(user?.email)} />

      <main className="main">
        <div className="topbar">
          <div>
            <h1>Campaign</h1>
            <p className="sub">Read the brief, then submit your clip.</p>
          </div>
        </div>

        <CampaignDetail id={params.id} user={effectiveUser} isAdmin={isAdminEmail(user?.email)} />
      </main>
    </div>
  );
}
