import { Resend } from "resend";

// Lazy init — only create the client when actually sending, not at module load.
// This prevents build-time crashes when RESEND_API_KEY is undefined.
function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

const FROM = process.env.EMAIL_FROM || "PulseFy <onboarding@resend.dev>";

/** Shared email shell — sunset-themed, matches the site. */
function shell(title, bodyHtml) {
  return `
  <div style="background:#0a0b0d;padding:40px 0;font-family:Inter,Arial,sans-serif;">
    <div style="max-width:480px;margin:0 auto;background:#16181f;border:1px solid #262a35;border-radius:16px;overflow:hidden;">
      <div style="padding:28px 32px;border-bottom:1px solid #1e2129;">
        <span style="display:inline-flex;align-items:center;gap:10px;color:#f3f5f7;font-weight:800;font-size:20px;">
          <span style="width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,#ff7a45,#ffb43a);display:inline-block;text-align:center;line-height:28px;color:#0a0b0d;font-weight:900;">P</span>
          PulseFy
        </span>
      </div>
      <div style="padding:32px;color:#a2a8b4;font-size:15px;line-height:1.7;">
        <h1 style="color:#f3f5f7;font-size:22px;margin:0 0 16px;">${title}</h1>
        ${bodyHtml}
      </div>
      <div style="padding:20px 32px;border-top:1px solid #1e2129;color:#6b7280;font-size:12px;">
        © 2026 PulseFy · You received this because someone used this email on PulseFy.
      </div>
    </div>
  </div>`;
}

function button(url, label) {
  return `<a href="${url}" style="display:inline-block;background:#ff7a45;color:#0a0b0d;font-weight:700;text-decoration:none;padding:13px 26px;border-radius:999px;margin:8px 0;">${label}</a>`;
}

export async function sendVerificationEmail(to, url) {
  return getResend().emails.send({
    from: FROM,
    to,
    subject: "Verify your PulseFy account",
    html: shell(
      "Verify your email",
      `<p>Welcome to PulseFy! Confirm your email address to activate your account.</p>
       <p>${button(url, "Verify email →")}</p>
       <p style="font-size:13px;color:#6b7280;">This link expires in 24 hours. If you didn't sign up, you can ignore this email.</p>`
    ),
  });
}

export async function sendResetEmail(to, url) {
  return getResend().emails.send({
    from: FROM,
    to,
    subject: "Reset your PulseFy password",
    html: shell(
      "Reset your password",
      `<p>We received a request to reset your password. Click below to choose a new one.</p>
       <p>${button(url, "Reset password →")}</p>
       <p style="font-size:13px;color:#6b7280;">This link expires in 1 hour. If you didn't request this, your password is safe — just ignore this email.</p>`
    ),
  });
}

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/**
 * Notify the PulseFy team of a new Ambassador Program application. `to` is the
 * configured admin inbox (comma-separated addresses are supported by Resend).
 */
export async function sendAmbassadorApplication(to, app) {
  const rows = [
    ["Name", app.name],
    ["Email", app.email],
    ["Country / region", app.country],
    ["Main platform", app.platform],
    ["Handle / channel", app.handle],
    ["Profile link", app.socialLink],
    ["Audience size", app.audienceSize || app.followers],
    ["Content category", app.contentCategory],
    ["Heard about us via", app.referralSource],
  ]
    .filter(([, v]) => v != null && v !== "")
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;">${esc(k)}</td><td style="padding:6px 0;color:#f3f5f7;">${esc(v)}</td></tr>`
    )
    .join("");

  return getResend().emails.send({
    from: FROM,
    to,
    replyTo: app.email,
    subject: `New Ambassador application — ${app.name}`,
    html: shell(
      "New Ambassador application",
      `<table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">${rows}</table>
       <p style="color:#6b7280;margin:0 0 6px;">Why they'd be a great ambassador</p>
       <p style="white-space:pre-wrap;color:#f3f5f7;background:#12141a;border:1px solid #262a35;border-radius:12px;padding:14px;">${esc(app.reason || app.pitch)}</p>
       <p style="font-size:13px;color:#6b7280;">Reply directly to this email to reach the applicant.</p>`
    ),
  });
}
