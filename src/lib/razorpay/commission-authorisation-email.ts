import "server-only";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

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
  const safeApplicationId = escapeHtml(claim.application_id);
  const safeCreatorId = escapeHtml(claim.creator_id);
  const acceptedAt = consentTimestamp(claim.consent_timestamp);
  const commissionText =
    "The merchant identified above has expressly consented to CloverLoop's additional platform commission of 4% on eligible transactions, along with applicable GST. The merchant has authorised the applicable deduction through Razorpay settlements in accordance with the agreed platform terms.";
  const subject = `Platform Commission Authorisation – CloverLoop – ${claim.razorpay_account_id}`;
  const lines = [
    `Creator legal/business name: ${claim.business_name}`,
    `Creator registered email: ${claim.creator_email}`,
    `Razorpay merchant Account ID: ${claim.razorpay_account_id}`,
    `CloverLoop creator ID: ${claim.creator_id}`,
    `Razorpay Application ID: ${claim.application_id}`,
    `Subscription plan status: ${claim.plan_status}`,
    "Additional platform commission: 4% on eligible successful transactions, plus applicable GST.",
    `Consent timestamp: ${acceptedAt}`,
    `Accepted terms version: ${claim.terms_version}`,
    "The creator expressly accepted the applicable commission and refund terms.",
    "",
    commissionText,
  ];
  return {
    subject,
    text: lines.join("\n"),
    html: `<!doctype html><html lang="en"><body><h1>${escapeHtml(subject)}</h1><p><strong>Creator legal/business name:</strong> ${safeBusinessName}</p><p><strong>Creator registered email:</strong> ${safeCreatorEmail}</p><p><strong>Razorpay merchant Account ID:</strong> ${safeAccountId}</p><p><strong>CloverLoop creator ID:</strong> ${safeCreatorId}</p><p><strong>Razorpay Application ID:</strong> ${safeApplicationId}</p><p><strong>Subscription plan status:</strong> ${escapeHtml(claim.plan_status)}</p><p><strong>Additional platform commission:</strong> 4% on eligible successful transactions, plus applicable GST.</p><p><strong>Consent timestamp:</strong> ${escapeHtml(acceptedAt)}</p><p><strong>Accepted terms version:</strong> ${escapeHtml(claim.terms_version)}</p><p>The creator expressly accepted the applicable commission and refund terms.</p><p>${escapeHtml(commissionText)}</p></body></html>`,
  };
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
            cc: [claim.creator_email],
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
