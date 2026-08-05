/**
 * Admin gate. Only the email(s) listed in ADMIN_EMAIL may review submissions
 * (approve/reject). Set ADMIN_EMAIL in your env — comma-separated for more
 * than one admin, e.g. ADMIN_EMAIL="you@example.com, partner@example.com".
 */
export function getAdminEmails() {
  return (process.env.ADMIN_EMAIL || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email) {
  if (!email) return false;
  const admins = getAdminEmails();
  // If no admin is configured, nobody is an admin (fail closed).
  return admins.includes(email.toLowerCase());
}
