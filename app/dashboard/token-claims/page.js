export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { users, tokenClaims } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import Sidebar from "@/components/Sidebar";
import AdminTokenClaims from "@/components/AdminTokenClaims";
import { isAdminEmail } from "@/lib/admin";
import { formatTokensPretty, TOKEN_SYMBOL } from "@/lib/solana";

// SUM over a bigint column comes back as a numeric string → parse as BigInt.
function toBig(v) {
  return BigInt(String(v ?? "0").split(".")[0] || "0");
}

export default async function TokenClaimsPage() {
  const session = await auth();
  const user = session?.user;
  const admin = isAdminEmail(user?.email);
  if (!admin) redirect("/dashboard");

  const [currentUser] = user?.id
    ? await db.select({ role: users.role }).from(users).where(eq(users.id, user.id))
    : [];
  const effectiveUser = user ? { ...user, role: currentUser?.role || user.role } : user;

  let paid = 0n;
  let pending = 0n;
  let pendingCount = 0;
  try {
    const [row] = await db
      .select({
        paid: sql`coalesce(sum(case when ${tokenClaims.status} = 'paid' then ${tokenClaims.amount} else 0 end), 0)`,
        pending: sql`coalesce(sum(case when ${tokenClaims.status} = 'pending' then ${tokenClaims.amount} else 0 end), 0)`,
        pendingCount: sql`count(*) filter (where ${tokenClaims.status} = 'pending')`,
      })
      .from(tokenClaims);
    paid = toBig(row?.paid);
    pending = toBig(row?.pending);
    pendingCount = Number(row?.pendingCount || 0);
  } catch {
    /* leave zeros — table may not be migrated yet */
  }

  return (
    <div className="app">
      <Sidebar user={effectiveUser} isAdmin={admin} />
      <main className="main">
        <div className="topbar">
          <div>
            <h1>${TOKEN_SYMBOL} Claims</h1>
            <p className="sub">Settle holder reward claims from the treasury and mark them paid.</p>
          </div>
        </div>

        <section className="kpis">
          <div className="kpi">
            <div className="k-top"><div className="k-ic">⏳</div></div>
            <div className="k-val">{formatTokensPretty(pending)}</div>
            <div className="k-lbl">Pending ({TOKEN_SYMBOL})</div>
          </div>
          <div className="kpi">
            <div className="k-top"><div className="k-ic">✅</div></div>
            <div className="k-val">{formatTokensPretty(paid)}</div>
            <div className="k-lbl">Paid out ({TOKEN_SYMBOL})</div>
          </div>
          <div className="kpi">
            <div className="k-top"><div className="k-ic">🧾</div></div>
            <div className="k-val">{pendingCount.toLocaleString()}</div>
            <div className="k-lbl">Pending requests</div>
          </div>
        </section>

        <AdminTokenClaims />
      </main>
    </div>
  );
}
