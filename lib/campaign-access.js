import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { campaignParticipants } from "@/db/schema";
import { isAdminEmail } from "@/lib/admin";

function campaignIdentifier(campaign) {
  return campaign.campaignId ?? campaign.id;
}

export async function participantCampaignIds(userId, campaignIds) {
  if (!campaignIds.length) return new Set();
  const rows = await db.select({ campaignId: campaignParticipants.campaignId })
    .from(campaignParticipants)
    .where(and(eq(campaignParticipants.creatorId, userId), eq(campaignParticipants.status, "authorized"), inArray(campaignParticipants.campaignId, campaignIds)));
  return new Set(rows.map((row) => row.campaignId));
}

export function canViewPrivateCampaignData(campaign, session, participantIds) {
  if (!campaign) return false;
  if (campaign.visibility !== "private") return true;
  const campaignId = campaignIdentifier(campaign);
  return campaign.brandId === session.user.id || isAdminEmail(session.user.email) || participantIds.has(campaignId);
}

export function canViewCampaignContributions(campaign, session, participantIds) {
  if (!campaign) return false;
  if (campaign.visibility !== "private" && campaign.showContributions !== "no") return true;
  const campaignId = campaignIdentifier(campaign);
  return campaign.brandId === session.user.id || isAdminEmail(session.user.email) || participantIds.has(campaignId);
}
