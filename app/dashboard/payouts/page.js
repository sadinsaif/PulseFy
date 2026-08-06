export const dynamic = "force-dynamic";

import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/db";
import { submissions, users, campaigns } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import Sidebar from "@/components/Sidebar";
import CreatorWallet from "@/components/CreatorWallet";
import AdminWithdrawals from "@/components/AdminWithdrawals";
import { isAdminEmail } from "@/lib/admin";

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
  const isBrand = user?.role === "brand";

  // ---- BRAND / ADMIN: money paid out to creators ----
  if (isBrand || admin) {
    let rows = [];
    try {
      const cols = {
        id: submissions.id,
        challengeId: submissions.challengeId,
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

    const totalPaid = rows.reduce((sum, r) => sum + (r.reward || 0), 0);
    const creatorsPaid = new Set(rows.map((r) => r.creatorEmail)).size;

    return (
      <div className="app">
        <Sidebar user={user} isAdmin={admin} />
        <main className="main">
          <div className="topbar">
            <div>
              <h1>Payouts</h1>
              <p className="sub">
                {admin
                  ? "Every reward paid to creators across the platform."
                  : "What you've paid creators for approved posts."}
              </p>
            </div>
          </div>

          <section className="kpis">
            <div className="kpi">
              <div className="k-top"><div className="k-ic">💸</div></div>
              <div className="k-val">${totalPaid.toLocaleString()}</div>
              <div className="k-lbl">Total paid out</div>
            </div>
            <div className="kpi">
              <div className="k-top"><div className="k-ic">✅</div></div>
              <div className="k-val">{rows.length.toLocaleString()}</div>
              <div className="k-lbl">Paid posts</div>
            </div>
            <div className="kpi">
              <div className="k-top"><div className="k-ic">👥</div></div>
              <div className="k-val">{creatorsPaid.toLocaleString()}</div>
              <div className="k-lbl">Creators paid</div>
            </div>
          </section>

          {admin && <AdminWithdrawals />}

          <section className="panel" style={{ marginTop: 18 }}>
            <div className="panel-head">
              <h3>Payment history</h3>
              <Link href="/dashboard/submissions" style={{ color: "var(--accent)" }}>
                Review submissions →
              </Link>
            </div>

            {rows.length === 0 ? (
              <p className="brief" style={{ marginTop: 10 }}>
                No payouts yet. When you approve a submission with a reward, it
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
                      <th>Post</th>
                      <th>Amount</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td><b>{r.creatorName || r.creatorEmail || "Creator"}</b></td>
                        <td>{r.challengeId}</td>
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

  // ---- CREATOR: money earned from approved posts ----
  let rows = [];
  let pendingCount = 0;
  try {
    rows = await db
      .select({
        id: submissions.id,
        challengeId: submissions.challengeId,
        platform: submissions.platform,
        postUrl: submissions.postUrl,
        reward: submissions.reward,
        status: submissions.status,
        createdAt: submissions.createdAt,
      })
      .from(submissions)
      .where(
        and(eq(submissions.userId, user.id), eq(submissions.status, "approved"))
      )
      .orderBy(desc(submissions.createdAt));

    const [pc] = await db
      .select({ n: sql`count(*)` })
      .from(submissions)
      .where(
        and(eq(submissions.userId, user.id), eq(submissions.status, "pending"))
      );
    pendingCount = Number(pc?.n || 0);
  } catch {
    rows = [];
  }

  const totalEarned = rows.reduce((sum, r) => sum + (r.reward || 0), 0);

  return (
    <div className="app">
      <Sidebar user={user} isAdmin={admin} />
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
            <div className="k-top"><div className="k-ic">💰</div></div>
            <div className="k-val">${totalEarned.toLocaleString()}</div>
            <div className="k-lbl">Total earned</div>
          </div>
          <div className="kpi">
            <div className="k-top"><div className="k-ic">✅</div></div>
            <div className="k-val">{rows.length.toLocaleString()}</div>
            <div className="k-lbl">Approved posts</div>
          </div>
          <div className="kpi">
            <div className="k-top"><div className="k-ic">⏳</div></div>
            <div className="k-val">{pendingCount.toLocaleString()}</div>
            <div className="k-lbl">In review</div>
          </div>
        </section>

        <section className="panel" style={{ marginTop: 18 }}>
          <div className="panel-head">
            <h3>Earnings history</h3>
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
