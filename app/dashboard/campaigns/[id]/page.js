export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import Sidebar from "@/components/Sidebar";
import CampaignDetail from "@/components/CampaignDetail";
import { isAdminEmail } from "@/lib/admin";

export default async function CampaignDetailPage({ params }) {
  const session = await auth();
  const user = session?.user;

  return (
    <div className="app">
      <Sidebar user={user} isAdmin={isAdminEmail(user?.email)} />

      <main className="main">
        <div className="topbar">
          <div>
            <h1>Campaign</h1>
            <p className="sub">Read the brief, then submit your clip.</p>
          </div>
        </div>

        <CampaignDetail id={params.id} />
      </main>
    </div>
  );
}
