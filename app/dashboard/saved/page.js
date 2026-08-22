export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { db } from "@/db";
import { savedCampaigns, campaigns, users, submissions, campaignParticipants } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import Sidebar from "@/components/Sidebar";
import SavedCampaigns from "@/components/SavedCampaigns";
import { isAdminEmail } from "@/lib/admin";

/**
 * /dashboard/saved — a creator's bookmarked campaigns. Unlike the "Saved" filter
 * chip on the browse feed (which can only see currently-open campaigns), this
 * page lists every saved campaign that still exists — including paused or ended
 * ones — so nothing a creator bookmarked silently disappears. Brands/admins get a
 * friendly stub. Read-only server query; the client grid handles unsave.
 */
export default async function SavedPage() {
  const session = await auth();
  const user = session?.user;
  const admin = isAdminEmail(user?.email);
  const isBrand = user?.role === "brand";

  if (isBrand || admin) {
    return (
      <div className="app">
        <Sidebar user={user} isAdmin={admin} />
        <main className="main">
          <div className="topbar">
            <div>
              <h1>Saved</h1>
              <p className="sub">This area is for creators.</p>
            </div>
          </div>
          <section className="panel">
            <p className="brief">
              Saved is a creator feature — creators bookmark campaigns here to
              come back to them later.
            </p>
          </section>
        </main>
      </div>
    );
  }

  // Same card columns as GET /api/campaigns, joined through the creator's saved
  // rows. deletedAt is excluded (a removed campaign is gone); paused/ended stay
  // so the full bookmark list is preserved.
  const subCount = sql`(select count(*) from ${submissions} where ${submissions.campaignId} = ${campaigns.id})`;
  let rows = [];
  try {
    const raw = await db
      .select({
        id: campaigns.id,
        title: campaigns.title,
        brief: campaigns.brief,
        platform: campaigns.platform,
        reward: campaigns.reward,
        budget: campaigns.budget,
        budgetSpent: campaigns.budgetSpent,
        spotlightReward: campaigns.spotlightReward,
        performanceMult: campaigns.performanceMult,
        endsAt: campaigns.endsAt,
        status: campaigns.status,
        createdAt: campaigns.createdAt,
        contentType: campaigns.contentType,
        visibility: campaigns.visibility,
        thumbnailUrl: campaigns.thumbnailUrl,
        brandName: users.name,
        brandVerified: users.isVerified,
        submissionCount: subCount,
      })
      .from(savedCampaigns)
      .innerJoin(campaigns, eq(savedCampaigns.campaignId, campaigns.id))
      .leftJoin(users, eq(campaigns.brandId, users.id))
      .where(
        and(
          eq(savedCampaigns.userId, user.id),
          sql`${campaigns.deletedAt} is null`,
          // A campaign saved while public but later flipped to private must stop
          // showing here unless the caller owns it or is an authorized participant
          // — mirrors GET /api/campaigns/[id]. IS DISTINCT FROM keeps null/legacy
          // visibility (treated as public) visible.
          sql`(${campaigns.visibility} is distinct from 'private' or ${campaigns.brandId} = ${user.id} or exists (select 1 from ${campaignParticipants} where ${campaignParticipants.campaignId} = ${campaigns.id} and ${campaignParticipants.creatorId} = ${user.id} and ${campaignParticipants.status} = 'authorized'))`
        )
      )
      .orderBy(desc(savedCampaigns.createdAt));

    // Serialize dates for the client card (countdown parses endsAt).
    rows = raw.map((r) => ({
      ...r,
      endsAt: r.endsAt ? new Date(r.endsAt).toISOString() : null,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
    }));
  } catch {
    rows = [];
  }

  return (
    <div className="app">
      <Sidebar user={user} isAdmin={false} />
      <main className="main">
        <div className="topbar">
          <div>
            <h1>Saved</h1>
            <p className="sub">Campaigns you&apos;ve bookmarked to come back to.</p>
          </div>
        </div>

        <SavedCampaigns campaigns={rows} now={Date.now()} />
      </main>
    </div>
  );
}
