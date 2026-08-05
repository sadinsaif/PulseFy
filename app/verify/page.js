export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { findToken, consumeToken } from "@/lib/tokens";

/**
 * /verify?token=...&email=...
 * The link inside the verification email lands here. We validate the token
 * server-side, mark the account verified, then redirect to /login.
 */
export default async function VerifyPage({ searchParams }) {
  const token = searchParams?.token || "";
  const email = (searchParams?.email || "").toLowerCase();

  if (!token || !email) redirect("/login?verify=invalid");

  const row = await findToken(email, token, "verify");
  if (!row) redirect("/login?verify=expired");

  await db
    .update(users)
    .set({ emailVerified: new Date() })
    .where(eq(users.email, email));

  await consumeToken(email, token);

  redirect("/login?verify=success");
}
