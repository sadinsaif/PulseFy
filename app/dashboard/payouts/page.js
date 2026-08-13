export const dynamic = "force-dynamic";

import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/db";
import { submissions, users, campaigns, withdrawals } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import Sidebar from "@/components/Sidebar";
import CreatorWallet from "@/components/CreatorWallet";
import AdminWithdrawals from "@/components/AdminWithdrawals";
import BrandWallet from "@/components/BrandWallet";
import AdminTopups from "@/components/AdminTopups";
import { isAdminEmail } from "@/lib/admin";
import { canViewPrivateCampaignData, participantCampaignIds } from "@/lib/campaign-access";
import { getCreatorBalanceCents } from "@/lib/creator-balance";

const PLABEL = {
  any: "Any",
  tiktok: "🎵 TikTok",
  instagram: "📸 Instagram",
  youtube: "▶️ YouTube",
  x: "𝕏 X",
};

function fmtDate(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

export default async function PayoutsPage() {
  const session = await auth();
  const user = session?.user;
  const admin = isAdminEmail(user?.email);
  const [currentUser] = user?.id
    ? await db.select({ role: users.role }).from(users).where(eq(users.id, user.id))
    : [];
  const isBrand = currentUser?.role === "brand";

  const effectiveUser = user ? { ...user, role: currentUser?.role || user.role } : user;
  // ---- BRAND / ADMIN: money paid out to creators ----
  if (isBrand || admin) {
    let rows = [];
    try {
      const cols = {
        id: submissions.id,
        challengeId: submissions.challengeId,
        campaignId: submissions.campaignId,
        platform: submissions.platform,
        postUrl: submissions.postUrl,
        reward: submissions.reward,
        createdAt: submissions.createdAt,
        creatorName: users.name,
        creatorEmail: users.email,
      };
      const base = db
        .select(cols)
        .from(submissions)
        .leftJoin(users, eq(submissions.userId, users.id));

      rows = admin
        ? await base
            .where(eq(submissions.status, "approved"))
            .orderBy(desc(submissions.createdAt))
        : await base
            .innerJoin(campaigns, eq(submissions.campaignId, campaigns.id))
            .where(
              and(
                eq(submissions.status, "approved"),
                eq(campaigns.brandId, user.id)
              )
            )
            .orderBy(desc(submissions.createdAt));
    } catch {
      rows = [];
    }

    // Total spent = approved rewards + spotlight bonuses (canonical budgetSpent),
    // scoped to the brand's campaigns (admin: platform-wide). Pending = money
    // owed if the whole review queue were approved — an estimate = Σ campaign
    // reward across the brand's pending submissions.
    let totalSpent = 0;
    let pendingEstimate = 0;
    try {
      const spendExpr = sql`coalesce(sum(case when ${submissions.status} = 'approved' then ${submissions.reward} else 0 end), 0)
        + coalesce(sum(case when ${submissions.spotlighted} = true then ${submissions.spotlightBonus} else 0 end), 0)`;
      if (admin) {
        const [ts] = await db.select({ n: spendExpr }).from(submissions);
        totalSpent = Number(ts?.n || 0);
        const [pe] = await db
          .select({ n: sql`coalesce(sum(${campaigns.reward}), 0)` })
          .from(submissions)
          .innerJoin(campaigns, eq(submissions.campaignId, campaigns.id))
          .where(eq(submissions.status, "pending"));
        pendingEstimate = Number(pe?.n || 0);
      } else {
        const [ts] = await db
          .select({ n: spendExpr })
          .from(submissions)
          .innerJoin(campaigns, eq(submissions.campaignId, campaigns.id))
          .where(eq(campaigns.brandId, user.id));
        totalSpent = Number(ts?.n || 0);
        const [pe] = await db
          .select({ n: sql`coalesce(sum(${campaigns.reward}), 0)` })
          .from(submissions)
          .innerJoin(campaigns, eq(submissions.campaignId, campaigns.id))
          .where(
            and(eq(submissions.status, "pending"), eq(campaigns.brandId, user.id))
          );
        pendingEstimate = Number(pe?.n || 0);
      }
    } catch {
      /* leave zeros */
    }

    // Admin-only: platform withdrawal summary straight from the withdrawals
    // table (amount/fee/net are stored in CENTS → ÷100). Brand rendering is
    // untouched — every value here is gated behind `admin` below.
    let wd = { paid: 0, pending: 0, failed: 0, requests: 0 };
    if (admin) {
      try {
        const [w] = await db
          .select({
            paid: sql`coalesce(sum(case when ${withdrawals.status} = 'paid' then ${withdrawals.net} else 0 end), 0)`,
            pending: sql`coalesce(sum(case when ${withdrawals.status} = 'pending' then ${withdrawals.amount} else 0 end), 0)`,
            failed: sql`coalesce(sum(case when ${withdrawals.status} = 'failed' then ${withdrawals.amount} else 0 end), 0)`,
            requests: sql`count(*)`,
          })
          .from(withdrawals);
        wd = {
          paid: Number(w?.paid || 0) / 100,
          pending: Number(w?.pending || 0) / 100,
          failed: Number(w?.failed || 0) / 100,
          requests: Number(w?.requests || 0),
        };
      } catch {
        /* leave zeros */
      }
    }

    const title = isBrand ? "Payments" : "Payouts";

    return (
      <div className="app">
        <Sidebar user={effectiveUser} isAdmin={admin} />
        <main className="main">
          <div className="topbar">
            <div>
              <h1>{title}</h1>
              <p className="sub">
                {admin
                  ? "Every reward paid to creators across the platform."
                  : "What you've paid creators for approved posts."}
              </p>
            </div>
          </div>

          {isBrand && <BrandWallet />}

          <section className="kpis">
            <div className="kpi">
              <div className="k-top"><div className="k-ic">💸</div></div>
              <div className="k-val">${totalSpent.toLocaleString()}</div>
              <div className="k-lbl">Total spent</div>
            </div>
            <div className="kpi">
              <div className="k-top"><div className="k-ic">⏳</div></div>
              <div className="k-val">${pendingEstimate.toLocaleString()}</div>
              <div className="k-lbl">Pending payments (est.)</div>
            </div>
            <div className="kpi">
              <div className="k-top"><div className="k-ic">✅</div></div>
              <div className="k-val">{rows.length.toLocaleString()}</div>
              <div className="k-lbl">Completed payments</div>
            </div>
          </section>

          {admin && (
            <section className="kpis" style={{ marginTop: 18 }}>
              <div className="kpi">
                <div className="k-top"><div className="k-ic">✅</div></div>
                <div className="k-val">${wd.paid.toLocaleString()}</div>
                <div className="k-lbl">Total paid out</div>
              </div>
              <div className="kpi">
                <div className="k-top"><div className="k-ic">⏳</div></div>
                <div className="k-val">${wd.pending.toLocaleString()}</div>
                <div className="k-lbl">Pending withdrawals</div>
              </div>
              <div className="kpi">
                <div className="k-top"><div className="k-ic">⚠️</div></div>
                <div className="k-val">${wd.failed.toLocaleString()}</div>
                <div className="k-lbl">Failed withdrawals</div>
              </div>
              <div className="kpi">
                <div className="k-top"><div className="k-ic">🧾</div></div>
                <div className="k-val">{wd.requests.toLocaleString()}</div>
                <div className="k-lbl">Total requests</div>
              </div>
            </section>
          )}

          {admin && <AdminWithdrawals />}
          {admin && <AdminTopups />}

          <section className="panel" style={{ marginTop: 18 }}>
            <div className="panel-head">
              <h3>Payment history</h3>
              <Link href="/dashboard/applications" style={{ color: "var(--accent)" }}>
                Review applications →
              </Link>
            </div>

            {rows.length === 0 ? (
              <p className="brief" style={{ marginTop: 10 }}>
                No payments yet. When you approve a submission with a reward, it
                shows up here.
              </p>
            ) : (
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Creator</th>
                      <th>Campaign</th>
                      <th>Platform</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Date</th>
                      <th>View</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td><b>{r.creatorName || r.creatorEmail || "Creator"}</b></td>
                        <td>{r.challengeId}</td>
                        <td>{PLABEL[r.platform] || r.platform}</td>
                        <td style={{ color: "var(--accent-3)", fontWeight: 700 }}>
                          ${(r.reward || 0).toLocaleString()}
                        </td>
                        <td><span className="status live">Paid</span></td>
                        <td>{fmtDate(r.createdAt)}</td>
                        <td>
                          <a href={r.postUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
                            View ↗
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
      </div>
    );
  }

  // ---- CREATOR: money earned from approved posts ----
  let rows = [];
  let totalEarned = 0; // approved rewards + spotlight bonuses + referral commissions
  let totalWithdrawn = 0; // money actually paid out (paid withdrawals)
  let pendingEst = 0; // estimated value of submissions still in review
  try {
    const submissionRows = await db
      .select({
        id: submissions.id,
        campaignId: submissions.campaignId,
        campaignRecordId: campaigns.id,
        challengeId: submissions.challengeId,
        platform: submissions.platform,
        postUrl: submissions.postUrl,
        reward: submissions.reward,
        status: submissions.status,
        createdAt: submissions.createdAt,
        campaignBrandId: campaigns.brandId,
        campaignVisibility: campaigns.visibility,
        campaignReward: campaigns.reward,
      })
      .from(submissions)
      .leftJoin(campaigns, eq(submissions.campaignId, campaigns.id))
      .where(eq(submissions.userId, user.id))
      .orderBy(desc(submissions.createdAt));
    const participantIds = await participantCampaignIds(user.id, [...new Set(submissionRows.map((submission) => submission.campaignId).filter(Boolean))]);
    const visibleSubmissions = submissionRows.filter((submission) =>
      !submission.campaignId || (
        submission.campaignRecordId &&
        canViewPrivateCampaignData({
          campaignId: submission.campaignId,
          brandId: submission.campaignBrandId,
          visibility: submission.campaignVisibility,
        }, session, participantIds)
      )
    );
    rows = visibleSubmissions.filter((submission) => submission.status === "approved");

    // The wallet is the financial source of truth: only ledger-backed campaign
    // commitments and earned referral commissions count as verified earnings.
    const { earnedCents } = await getCreatorBalanceCents(db, user.id);
    totalEarned = earnedCents / 100;

    // Total withdrawn = withdrawals actually marked paid (stored in cents).
    const [wd] = await db
      .select({ n: sql`coalesce(sum(${withdrawals.amount}), 0)` })
      .from(withdrawals)
      .where(
        and(eq(withdrawals.userId, user.id), eq(withdrawals.status, "paid"))
      );
    totalWithdrawn = Number(wd?.n || 0) / 100;

    // Pending (est.) — what the in-review queue is worth if every clip gets
    // approved: Σ campaign reward across the creator's pending submissions.
    // Mirrors the brand "Pending payments (est.)" convention.
    pendingEst = visibleSubmissions
      .filter((submission) => submission.status === "pending")
      .reduce((sum, submission) => sum + Number(submission.campaignReward || 0), 0);
  } catch {
    rows = [];
  }

  return (
    <div className="app">
      <Sidebar user={effectiveUser} isAdmin={admin} />
      <main className="main">
        <div className="topbar">
          <div>
            <h1>Payouts</h1>
            <p className="sub">Track your earnings and cash out your balance.</p>
          </div>
        </div>

        <CreatorWallet />

        <section className="kpis" style={{ marginTop: 18 }}>
          <div className="kpi">
            <div className="k-top"><div className="k-ic">⏳</div></div>
            <div className="k-val">${pendingEst.toLocaleString()}</div>
            <div className="k-lbl">Pending (est.)</div>
          </div>
          <div className="kpi">
            <div className="k-top"><div className="k-ic">💰</div></div>
            <div className="k-val">${totalEarned.toLocaleString()}</div>
            <div className="k-lbl">Verified earnings</div>
          </div>
          <div className="kpi">
            <div className="k-top"><div className="k-ic">🏦</div></div>
            <div className="k-val">${totalWithdrawn.toLocaleString()}</div>
            <div className="k-lbl">Total withdrawn</div>
          </div>
        </section>

        <section className="panel" style={{ marginTop: 18 }}>
          <div className="panel-head">
            <h3>Payment history</h3>
            <Link href="/dashboard/campaigns" style={{ color: "var(--accent)" }}>
              Browse campaigns →
            </Link>
          </div>

          {rows.length === 0 ? (
            <p className="brief" style={{ marginTop: 10 }}>
              No earnings yet. Submit clips to campaigns — once a brand approves a
              post, your reward shows up here.
            </p>
          ) : (
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table>
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Platform</th>
                    <th>Post</th>
                    <th>Reward</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td><b>{r.challengeId}</b></td>
                      <td>{PLABEL[r.platform] || r.platform}</td>
                      <td>
                        <a href={r.postUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
                          View ↗
                        </a>
                      </td>
                      <td style={{ color: "var(--accent-3)", fontWeight: 700 }}>
                        ${(r.reward || 0).toLocaleString()}
                      </td>
                      <td>{fmtDate(r.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
