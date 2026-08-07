export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import Sidebar from "@/components/Sidebar";
import Leaderboard from "@/components/Leaderboard";
import { isAdminEmail } from "@/lib/admin";

/**
 * Leaderboard — every creator ranked by total dollars earned, highest first.
 */
export default async function LeaderboardPage({ searchParams }) {
  const session = await auth();
  const user = session?.user;
  const initialQ = typeof searchParams?.q === "string" ? searchParams.q : "";

  return (
    <div className="app">
      <Sidebar user={user} isAdmin={isAdminEmail(user?.email)} />
      <main className="main">
        <div className="topbar">
          <div>
            <h1>Leaderboard</h1>
            <p className="sub">Top creators ranked by total earnings — highest first.</p>
          </div>
        </div>
        <Leaderboard initialQ={initialQ} />
      </main>
    </div>
  );
}
