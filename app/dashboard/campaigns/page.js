export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { db } from "@/db";
import { campaigns, users, submissions } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import Sidebar from "@/components/Sidebar";
import BrandCampaigns from "@/components/BrandCampaigns";
import BrowseCampaigns from "@/components/BrowseCampaigns";
import AdminCampaigns from "@/components/AdminCampaigns";
import { isAdminEmail } from "@/lib/admin";

export default async function CampaignsPage() {
  const session = await auth();
  const user = session?.user;
  const [currentUser] = user?.id
    ? await db.select({ role: users.role }).from(users).where(eq(users.id, user.id))
    : [];
  const isBrand = currentUser?.role === "brand";
  const effectiveUser = user ? { ...user, role: currentUser?.role || user.role } : user;
  const admin = isAdminEmail(user?.email);

  // ---- ADMIN: platform-wide campaign management ----------------------------
  // Every campaign (any brand, any status) with the same aggregate columns the
  // brand table uses — the subquery expressions are copied verbatim from
  // /api/campaigns so the numbers match exactly. No mutation here; status
  // changes go through the admin-allowed PATCH /api/campaigns/[id].
  let adminRows = [];
  if (admin) {
    try {
      const budgetSpent = sql`(
        (select coalesce(sum(${submissions.reward}), 0) from ${submissions}
           where ${submissions.campaignId} = ${campaigns.id} and ${submissions.status} = 'approved')
        + (select coalesce(sum(${submissions.spotlightBonus}), 0) from ${submissions}
           where ${submissions.campaignId} = ${campaigns.id} and ${submissions.spotlighted} = true)
      )`;
      // Internal-only funding totals: these are deliberately selected only for
      // the admin campaign table, never public campaign responses.
      const funded = sql`(select coalesce(sum(amount), 0) from campaign_funding_ledger where campaign_funding_ledger.campaign_id = ${campaigns.id} and campaign_funding_ledger.action = 'funding')`;
      const reserved = sql`(select coalesce(sum(case when action = 'reserve' then amount when action = 'release' then -amount else 0 end), 0) from campaign_funding_ledger where campaign_funding_ledger.campaign_id = ${campaigns.id})`;
      const ledgerSpent = sql`(select coalesce(sum(case when action = 'spend' then amount when action = 'reversal' then -amount else 0 end), 0) from campaign_funding_ledger where campaign_funding_ledger.campaign_id = ${campaigns.id})`;
      const available = sql`${funded} - ${reserved} - ${ledgerSpent}`;
      const submissionCount = sql`(select count(*) from ${submissions} where ${submissions.campaignId} = ${campaigns.id})`;
      const pendingCount = sql`(select count(*) from ${submissions} where ${submissions.campaignId} = ${campaigns.id} and ${submissions.status} = 'pending')`;
      const approvedCount = sql`(select count(*) from ${submissions} where ${submissions.campaignId} = ${campaigns.id} and ${submissions.status} = 'approved')`;
      const creatorsSelected = sql`(select count(distinct ${submissions.userId}) from ${submissions} where ${submissions.campaignId} = ${campaigns.id} and ${submissions.status} = 'approved')`;
      const totalViews = sql`(select coalesce(sum(${submissions.views}), 0) from ${submissions} where ${submissions.campaignId} = ${campaigns.id})`;

      const raw = await db
        .select({
          id: campaigns.id,
          title: campaigns.title,
          status: campaigns.status,
          budget: campaigns.budget,
          budgetSpent,
          funded,
          reserved,
          ledgerSpent,
          available,
          submissionCount,
          pendingCount,
          approvedCount,
          creatorsSelected,
          totalViews,
          createdAt: campaigns.createdAt,
          brandName: users.name,
        })
        .from(campaigns)
        .leftJoin(users, eq(campaigns.brandId, users.id))
        .orderBy(desc(campaigns.createdAt));

      // Normalise createdAt to an ISO string for clean client serialization.
      adminRows = raw.map((r) => ({
        ...r,
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
      }));
    } catch {
      adminRows = [];
    }
  }

  return (
    <div className="app">
      <Sidebar user={effectiveUser} isAdmin={admin} />

      <main className="main">
        <div className="topbar">
          <div>
            <h1>Campaigns</h1>
            <p className="sub">
              {admin
                ? "Every campaign on the platform — pause, end, or reactivate any of them."
                : isBrand
                ? "Launch a campaign and review the clips creators submit."
                : "Browse open brand campaigns and submit your clips to earn."}
            </p>
          </div>
        </div>

        {admin ? (
          <AdminCampaigns rows={adminRows} />
        ) : isBrand ? (
          <BrandCampaigns />
        ) : (
          <BrowseCampaigns />
        )}
      </main>
    </div>
  );
}
