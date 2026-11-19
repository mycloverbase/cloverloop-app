import "server-only";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PRODUCTION_URL } from "@/lib/site";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type EmailClaim = {
  email_id: string;
  consent_id: string;
  creator_id: string;
  recipient_email: string | null;
  creator_email: string;
  business_name: string;
  razorpay_account_id: string;
  application_id: string;
  plan_status: string;
  consent_timestamp: string;
  terms_version: string;
  attempt_count: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseClaim(value: unknown): EmailClaim | null {
  if (
    !isRecord(value) ||
    typeof value.email_id !== "string" ||
    typeof value.consent_id !== "string" ||
    typeof value.creator_id !== "string" ||
    (value.recipient_email !== null && typeof value.recipient_email !== "string") ||
    typeof value.creator_email !== "string" ||
    typeof value.business_name !== "string" ||
    typeof value.razorpay_account_id !== "string" ||
    typeof value.application_id !== "string" ||
    typeof value.plan_status !== "string" ||
    typeof value.consent_timestamp !== "string" ||
    typeof value.terms_version !== "string" ||
    typeof value.attempt_count !== "number"
  ) return null;
  return value as EmailClaim;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function consentTimestamp(value: string): string {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : value;
}

function emailBody(claim: EmailClaim) {
  const safeBusinessName = escapeHtml(claim.business_name);
  const safeCreatorEmail = escapeHtml(claim.creator_email);
  const safeAccountId = escapeHtml(claim.razorpay_account_id);
  const planLabel = claim.plan_status === "creator" ? "Creator Plan" : claim.plan_status;
  const safePlanLabel = escapeHtml(planLabel);
  const acceptedAt = consentTimestamp(claim.consent_timestamp);
  const safeAcceptedAt = escapeHtml(acceptedAt);
  const safeLogoUrl = escapeHtml(`${PRODUCTION_URL}/images/brand/logo.png`);
  const commissionText =
    "The merchant identified above has expressly consented to CloverLoop's additional platform commission of 4% on eligible successful transactions, plus applicable GST. The merchant has authorised the applicable deduction through Razorpay settlements in accordance with the agreed platform terms.";
  const subject = `Platform Commission Authorisation – CloverLoop – ${claim.razorpay_account_id}`;
  const details: Array<[string, string]> = [
    ["Creator legal/business name", safeBusinessName],
    ["Creator registered email", safeCreatorEmail],
    ["Razorpay merchant Account ID", safeAccountId],
    ["Subscription plan", safePlanLabel],
    ["Additional platform commission", "4% + applicable GST on eligible successful transactions"],
    ["Consent timestamp", safeAcceptedAt],
  ];
  const detailRows = details.map(([label, value]) => `
<tr>
  <td class="detail-label" width="38%" style="width:38%;padding:14px 16px;border-bottom:1px solid #e4e9df;font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.45;font-weight:600;color:#4f6157;vertical-align:top">${label}</td>
  <td class="detail-value" width="62%" style="width:62%;padding:14px 16px;border-bottom:1px solid #e4e9df;font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#14382b;vertical-align:top">${value}</td>
</tr>`).join("");
  return {
    subject,
    text: [
      "Platform Commission Authorisation – CloverLoop",
      "",
      `Creator legal/business name: ${claim.business_name}`,
      `Creator registered email: ${claim.creator_email}`,
      `Razorpay merchant Account ID: ${claim.razorpay_account_id}`,
      `Subscription plan: ${planLabel}`,
      "Additional platform commission: 4% + applicable GST on eligible successful transactions.",
      `Consent timestamp: ${acceptedAt}`,
      "",
      "Consent confirmation:",
      commissionText,
    ].join("\n"),
    html: `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Platform Commission Authorisation</title>
<style>
body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
table,td{mso-table-lspace:0;mso-table-rspace:0}
img{border:0;display:block;-ms-interpolation-mode:bicubic}
@media only screen and (max-width:620px){
  .wrap{width:100%!important}
  .pad{padding-left:22px!important;padding-right:22px!important}
  .detail-label,.detail-value{display:block!important;width:100%!important}
  .detail-label{padding-bottom:4px!important;border-bottom:0!important}
  .detail-value{padding-top:0!important}
  h1{font-size:25px!important}
}
</style>
</head>
<body style="margin:0;padding:0;background:#f3f1e4;font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#14382b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f3f1e4" style="width:100%;background:#f3f1e4">
<tr><td align="center" style="padding:28px 12px 36px">
<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px">
<tr><td class="pad" style="padding:0 4px 22px">
<img src="${safeLogoUrl}" alt="CloverLoop" width="152" style="width:152px;height:auto;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;color:#1b4332">
</td></tr>
<tr><td bgcolor="#fbfaf5" style="background:#fbfaf5;border:1px solid #d3dbc8;border-top:4px solid #a8c5a0;border-radius:14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td class="pad" style="padding:32px 36px 20px">
<h1 style="margin:0;font-size:29px;line-height:1.2;font-weight:650;letter-spacing:-.02em;color:#14382b">Platform Commission Authorisation</h1>
</td></tr>
<tr><td class="pad" style="padding:0 36px">
<table aria-label="Platform commission authorisation details" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border:1px solid #e4e9df;border-radius:10px;border-collapse:separate;border-spacing:0;background:#fff">
${detailRows}
</table>
</td></tr>
<tr><td class="pad" style="padding:24px 36px 32px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding:18px 20px;border-left:4px solid #1b4332;border-radius:6px;background:#eef3e8">
<p style="margin:0 0 8px;font-size:13px;line-height:1.4;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#1b4332">Consent confirmation</p>
<p style="margin:0;font-size:15px;line-height:1.65;color:#14382b">${escapeHtml(commissionText)}</p>
</td></tr>
</table>
</td></tr>
</table>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`,
  };
}

export function getRazorpayCommissionAuthorisationEmailPreview() {
  return emailBody({
    email_id: "preview-email",
    consent_id: "preview-consent",
    creator_id: "preview-creator",
    recipient_email: "partnerships@example.test",
    creator_email: "creator@example.test",
    business_name: "Test Creator",
    razorpay_account_id: "acc_PREVIEW123",
    application_id: "preview-application",
    plan_status: "creator",
    consent_timestamp: "2026-11-19T02:30:00.000Z",
    terms_version: "preview-only",
    attempt_count: 1,
  });
}

async function finishClaim(
  admin: AdminClient,
  claim: EmailClaim,
  sent: boolean,
  messageId: string | null,
  errorCode: string | null,
): Promise<boolean> {
  const { data, error } = await admin.rpc(
    "finish_razorpay_commission_authorisation_email",
    {
      p_email_id: claim.email_id,
      p_sent: sent,
      p_message_id: messageId,
      p_error_code: errorCode,
    },
  );
  if (error || data !== true) {
    console.error("Razorpay commission authorisation email status could not be saved.", {
      code: error?.code ?? "lease_not_owned",
    });
    return false;
  }
  return true;
}

async function alertFailedDelivery(
  admin: AdminClient,
  claim: EmailClaim,
  from: string,
  apiKey: string,
): Promise<void> {
  const alertAddress = process.env.RAZORPAY_COMMISSION_EMAIL_ALERT_TO?.trim();
  if (!alertAddress || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alertAddress)) return;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `razorpay-commission-alert-${claim.consent_id}`,
      },
      body: JSON.stringify({
        from,
        to: [alertAddress],
        subject: "Razorpay commission authorisation email delivery failed",
        text: `Delivery retries exhausted for consent ${claim.consent_id} (creator ${claim.creator_id}). The original consent remains recorded.`,
      }),
    });
    if (!response.ok) return;
    const { error } = await admin
      .from("razorpay_commission_authorisation_emails")
      .update({ failure_alerted_at: new Date().toISOString() })
      .eq("id", claim.email_id)
      .eq("status", "failed")
      .is("failure_alerted_at", null);
    if (error) console.error("Razorpay commission email failure alert status could not be saved.", { code: error.code });
  } catch {
    console.error("Razorpay commission email failure alert could not be delivered.");
  }
}

export async function processRazorpayCommissionAuthorisationEmailQueue(
  admin: AdminClient,
  batchSize = 5,
): Promise<{ claimed: number; sent: number; retried: number; failed: number }> {
  const { data, error } = await admin.rpc(
    "claim_razorpay_commission_authorisation_emails",
    { p_batch_size: batchSize },
  );
  if (error || !Array.isArray(data)) {
    console.error("Razorpay commission authorisation emails could not be claimed.", {
      code: error?.code ?? "invalid_response",
    });
    return { claimed: 0, sent: 0, retried: 0, failed: 0 };
  }

  let sentCount = 0;
  let retriedCount = 0;
  let failedCount = 0;
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  const partnershipsCcEmail = process.env.RAZORPAY_PARTNERSHIPS_CC_EMAIL?.trim();
  for (const candidate of data) {
    const claim = parseClaim(candidate);
    if (!claim) {
      console.error("A Razorpay commission authorisation email claim was invalid.");
      continue;
    }

    let response: Response | null = null;
    let messageId: string | null = null;
    let errorCode = "resend_not_configured";
    if (apiKey && from && claim.recipient_email) {
      try {
        const email = emailBody(claim);
        const cc = [claim.creator_email];
        if (
          partnershipsCcEmail &&
          partnershipsCcEmail.toLowerCase() !== claim.creator_email.trim().toLowerCase() &&
          partnershipsCcEmail.toLowerCase() !== claim.recipient_email.trim().toLowerCase()
        ) {
          cc.push(partnershipsCcEmail);
        }
        response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `razorpay-commission-${claim.consent_id}`,
          },
          body: JSON.stringify({
            from,
            to: [claim.recipient_email],
            cc,
            subject: email.subject,
            html: email.html,
            text: email.text,
          }),
          signal: AbortSignal.timeout(10_000),
        });
        if (response.ok) {
          const result: unknown = await response.json().catch(() => null);
          messageId = isRecord(result) && typeof result.id === "string" ? result.id : null;
          if (!messageId) errorCode = "resend_message_id_missing";
        } else {
          errorCode = `resend_http_${response.status}`;
        }
      } catch {
        errorCode = "resend_network_error";
      }
    }

    const delivered = Boolean(response?.ok && messageId);
    if (!(await finishClaim(admin, claim, delivered, messageId, delivered ? null : errorCode))) {
      failedCount += 1;
      continue;
    }
    if (delivered) {
      sentCount += 1;
    } else {
      const terminal = claim.attempt_count >= 8;
      if (terminal) {
        failedCount += 1;
        if (apiKey && from) await alertFailedDelivery(admin, claim, from, apiKey);
      } else {
        retriedCount += 1;
      }
      console.error("Razorpay commission authorisation email delivery failed.", {
        consentId: claim.consent_id,
        attempt: claim.attempt_count,
        terminal,
        code: errorCode,
      });
    }
  }

  return { claimed: data.length, sent: sentCount, retried: retriedCount, failed: failedCount };
}
