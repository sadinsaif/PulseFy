export const dynamic = "force-dynamic";

import Link from "next/link";
import { auth } from "@/auth";
import Navbar from "@/components/Navbar";
import AmbassadorForm from "@/components/AmbassadorForm";

export const metadata = {
  title: "Become an Ambassador · PulseFy",
  description:
    "Join the PulseFy Ambassador Program. Bring creators and brands into the AI creator economy, unlock exclusive perks, and earn on every referral.",
};

export default async function AmbassadorPage() {
  const session = await auth();

  return (
    <>
      <Navbar session={session} />

      <AmbassadorForm />

      {/* FOOTER — mirrors the landing page for a consistent public shell */}
      <footer className="footer">
        <div className="container">
          <div className="footer-grid">
            <div className="footer-brand">
              <Link href="/" className="logo">
                <span className="logo-mark" aria-hidden="true" />
                <span className="wordmark">Pulse<span className="wm-fy">Fy</span></span>
              </Link>
              <p>Infrastructure for the AI creator economy. From brief to payout — automated.</p>
            </div>
            <div className="footer-col">
              <h4>Product</h4>
              <a href="/#features">Features</a>
              <a href="/#pricing">Pricing</a>
              <Link href="/dashboard">Dashboard</Link>
              <Link href="/ambassador">Ambassadors</Link>
            </div>
            <div className="footer-col">
              <h4>Company</h4>
              <a href="#">About</a>
              <a href="#">Blog</a>
              <a href="#">Careers</a>
              <a href="#">Contact</a>
            </div>
            <div className="footer-col">
              <h4>Legal</h4>
              <a href="#">Privacy</a>
              <a href="#">Terms</a>
              <a href="#">Compliance</a>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© 2026 PulseFy. All rights reserved.</span>
            <span>Made for creators &amp; brands.</span>
          </div>
        </div>
      </footer>
    </>
  );
}
