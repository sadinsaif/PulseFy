export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import Sidebar from "@/components/Sidebar";
import ProfileView from "@/components/ProfileView";
import { isAdminEmail } from "@/lib/admin";

export default async function ProfilePage() {
  const session = await auth();
  const user = session?.user;

  return (
    <div className="app">
      <Sidebar user={user} isAdmin={isAdminEmail(user?.email)} />

      <main className="main">
        <div className="topbar">
          <div>
            <h1>My Profile</h1>
            <p className="sub">
              Set up your creator profile and track your submissions and earnings.
            </p>
          </div>
        </div>

        <ProfileView />
      </main>
    </div>
  );
}
