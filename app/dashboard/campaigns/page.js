export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import Sidebar from "@/components/Sidebar";
import BrandCampaigns from "@/components/BrandCampaigns";
import BrowseCampaigns from "@/components/BrowseCampaigns";
import { isAdminEmail } from "@/lib/admin";

export default async function CampaignsPage() {
  const session = await auth();
  const user = session?.user;
  const isBrand = user?.role === "brand";

  return (
    <div className="app">
      <Sidebar user={user} isAdmin={isAdminEmail(user?.email)} />

      <main className="main">
        <div className="topbar">
          <div>
            <h1>Campaigns</h1>
            <p className="sub">
              {isBrand
                ? "Launch a campaign and review the clips creators submit."
                : "Browse open brand campaigns and submit your clips to earn."}
            </p>
          </div>
        </div>

        {isBrand ? <BrandCampaigns /> : <BrowseCampaigns />}
      </main>
    </div>
  );
}
