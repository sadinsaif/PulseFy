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
  // Restricted contributions (a private campaign, or one with showContributions
  // set to "no") are visible only to the brand owner, an admin, or an authorized
  // participant. An anonymous viewer (no session — e.g. a logged-out visitor on a
  // public creator profile) is none of those, so short-circuit to false before
  // dereferencing session.user.
  if (!session?.user) return false;
  const campaignId = campaignIdentifier(campaign);
  return campaign.brandId === session.user.id || isAdminEmail(session.user.email) || participantIds.has(campaignId);
}
