export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import Sidebar from "@/components/Sidebar";
import TokenDashboard from "@/components/TokenDashboard";
import { isAdminEmail } from "@/lib/admin";
import { TOKEN_SYMBOL } from "@/lib/solana";

export default async function TokenPage() {
  const session = await auth();
  const user = session?.user;
  const admin = isAdminEmail(user?.email);
  const [currentUser] = user?.id
    ? await db.select({ role: users.role }).from(users).where(eq(users.id, user.id))
    : [];
  const effectiveUser = user ? { ...user, role: currentUser?.role || user.role } : user;

  return (
    <div className="app">
      <Sidebar user={effectiveUser} isAdmin={admin} />
      <main className="main">
        <div className="topbar">
          <div>
            <h1>${TOKEN_SYMBOL}</h1>
            <p className="sub">
              Connect your Solana wallet, hold ${TOKEN_SYMBOL}, and claim your rewards.
            </p>
          </div>
        </div>

        <TokenDashboard />
      </main>
    </div>
  );
}
