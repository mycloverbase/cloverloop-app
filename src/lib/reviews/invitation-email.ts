import "server-only";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/site";
import {
  REVIEW_TOKEN_TTL_DAYS,
  createReviewToken,
  hashReviewToken,
  isReviewTokenConfigured,
} from "@/lib/reviews/tokens";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export type ReviewInvitationJob = {
  invitation_id: string;
  delivery_generation: number;
  customer_email: string;
  customer_name: string | null;
  product_name: string;
  creator_name: string;
};

export type ReviewInvitationQueueResult = {
  claimed: number;
  accepted: number;
  failed: number;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 100;
// Resend's default limit is 2 requests per second per team; stay safely below it.
const DEFAULT_SEND_INTERVAL_MS = 600;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function supportEmail(): string {
  return process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "info@cloverloop.in";
}

export function isReviewInvitationDeliveryEnabled(): boolean {
  return process.env.REVIEW_INVITATIONS_ENABLED?.trim() === "true" &&
    Boolean(process.env.RESEND_API_KEY?.trim()) &&
    Boolean(process.env.RESEND_FROM_EMAIL?.trim()) &&
    isReviewTokenConfigured();
}

export function reviewInvitationBatchSize(): number {
  const configured = Number(process.env.REVIEW_INVITATION_BATCH_SIZE);
  if (!Number.isInteger(configured) || configured < 1) return DEFAULT_BATCH_SIZE;
  return Math.min(configured, MAX_BATCH_SIZE);
}

export function getReviewLink(token: string): string {
  const url = new URL("/review", SITE_URL);
  url.hash = new URLSearchParams({ token }).toString();
  return url.toString();
}

export function getReviewInvitationEmail(
  job: Pick<ReviewInvitationJob, "customer_name" | "product_name" | "creator_name">,
  reviewLink: string,
): { subject: string; html: string; text: string } {
  const productName = job.product_name.trim();
  const creatorName = job.creator_name.trim();
  const buyerName = job.customer_name?.trim().split(/\s+/)[0] || "there";
  const subjectProductName = productName.replace(/[\r\n\t]+/g, " ").slice(0, 100);
  const safeProductName = escapeHtml(productName);
  const safeCreatorName = escapeHtml(creatorName);
  const safeBuyerName = escapeHtml(buyerName);
  const safeLink = escapeHtml(reviewLink);
  const safeSupportEmail = escapeHtml(supportEmail());
  const stars = "&#9733;&#9733;&#9733;&#9733;&#9733;";

  return {
    subject: `How was your experience with ${subjectProductName}?`,
    html: `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>How was your experience?</title>
<style>body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table,td{mso-table-lspace:0;mso-table-rspace:0}@media only screen and (max-width:620px){.wrap{width:100%!important}.pad{padding-left:22px!important;padding-right:22px!important}h1{font-size:25px!important}.cta a{display:block!important;text-align:center!important}}</style></head>
<body style="margin:0;padding:0;background:#f3f1e4;font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#14382b">
<div style="display:none;max-height:0;overflow:hidden">Share a quick review of ${safeProductName} from ${safeCreatorName}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f3f1e4"><tr><td align="center" style="padding:28px 12px 36px">
<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px">
<tr><td class="pad" style="padding:0 4px 22px"><a href="https://cloverloop.in" style="text-decoration:none;color:#1b4332;font-size:24px;font-weight:700">CloverLoop</a></td></tr>
<tr><td bgcolor="#fbfaf5" style="background:#fbfaf5;border:1px solid #d3dbc8;border-top:4px solid #a8c5a0;border-radius:14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td class="pad" style="padding:32px 36px 8px">
<p style="margin:0 0 10px;font-size:22px;letter-spacing:4px;color:#2f7254">${stars}</p>
<h1 style="margin:0 0 18px;font-size:28px;line-height:1.2;font-weight:600;color:#14382b">How was your experience with ${safeProductName}?</h1>
<p style="margin:0 0 14px;font-size:16px;line-height:1.6">Hi ${safeBuyerName},</p>
<p style="margin:0 0 14px;font-size:16px;line-height:1.6">It&apos;s been a few days since you purchased <strong>${safeProductName}</strong> from ${safeCreatorName}.</p>
<p style="margin:0 0 14px;font-size:16px;line-height:1.6">We&apos;d love to hear what you think! Your feedback helps other buyers make informed decisions and helps creators improve their products.</p>
<p style="margin:0;font-size:16px;line-height:1.6">Share your experience by leaving a quick review.</p></td></tr>
<tr><td class="pad cta" style="padding:22px 36px 10px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#1b4332" style="background:#1b4332;border-radius:10px"><a href="${safeLink}" style="display:inline-block;padding:15px 30px;color:#f3f1e4;font-size:16px;font-weight:600;text-decoration:none">Write a Review</a></td></tr></table></td></tr>
<tr><td class="pad" style="padding:14px 36px 30px;font-size:14px;line-height:1.6;color:#4f6157"><p style="margin:0 0 12px">This private link is just for you, works on any device and expires in ${REVIEW_TOKEN_TTL_DAYS} days. Reviews show only the display name you choose, never your email address.</p><p style="margin:0">Thank you for supporting independent creators.<br>Team CloverLoop</p></td></tr>
</table></td></tr>
<tr><td class="pad" align="center" style="padding:22px 24px 0;font-size:12px;line-height:1.6;color:#4f6157">You&apos;re receiving this one-time email because you purchased ${safeProductName} on <a href="https://cloverloop.in" style="color:#4f6157">cloverloop.in</a>.<br>Questions? Contact <a href="mailto:${safeSupportEmail}" style="color:#4f6157">${safeSupportEmail}</a>.<br>CloverLoop, India</td></tr>
</table></td></tr></table></body></html>`,
    text: `Hi ${buyerName},

It's been a few days since you purchased ${productName} from ${creatorName}.

We'd love to hear what you think!

Your feedback helps other buyers make informed decisions and helps creators improve their products.

Share your experience by leaving a quick review:
${reviewLink}

This private link expires in ${REVIEW_TOKEN_TTL_DAYS} days.

Thank you for supporting independent creators.

Team CloverLoop

You're receiving this one-time email because you purchased ${productName} on cloverloop.in.
Questions? Contact ${supportEmail()}.`,
  };
}

function parseJob(value: unknown): ReviewInvitationJob | null {
  if (!isRecord(value)) return null;
  const {
    invitation_id: invitationId,
    delivery_generation: generation,
    customer_email: customerEmail,
    customer_name: customerName,
    product_name: productName,
    creator_name: creatorName,
  } = value;
  if (
    typeof invitationId !== "string" ||
    !uuidPattern.test(invitationId) ||
    typeof generation !== "number" ||
    !Number.isSafeInteger(generation) ||
    generation < 0 ||
    typeof customerEmail !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail) ||
    (customerName !== null && typeof customerName !== "string") ||
    typeof productName !== "string" ||
    !productName.trim() ||
    typeof creatorName !== "string" ||
    !creatorName.trim()
  ) return null;
  return {
    invitation_id: invitationId,
    delivery_generation: generation,
    customer_email: customerEmail,
    customer_name: customerName,
    product_name: productName,
    creator_name: creatorName,
  };
}

async function finishDelivery(
  admin: AdminClient,
  invitationId: string,
  generation: number,
  status: "accepted" | "failed",
  providerEmailId: string | null,
  errorCode: string | null,
): Promise<boolean> {
  const { data, error } = await admin.rpc("finish_product_review_invitation_delivery", {
    p_invitation_id: invitationId,
    p_delivery_generation: generation,
    p_status: status,
    p_provider_email_id: providerEmailId,
    p_error_code: errorCode,
  });
  if (error || data !== true) {
    console.error("Review invitation delivery state could not be saved.", {
      code: error?.code ?? "lease_not_owned",
    });
    return false;
  }
  return status === "accepted";
}

async function sendJob(
  admin: AdminClient,
  job: ReviewInvitationJob,
  apiKey: string,
  from: string,
): Promise<boolean> {
  const token = createReviewToken(job.invitation_id, job.delivery_generation);
  if (!token) {
    await finishDelivery(admin, job.invitation_id, job.delivery_generation, "failed", null, "review_token_not_configured");
    return false;
  }
  const expiresAt = new Date(Date.now() + REVIEW_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: attached, error: attachError } = await admin.rpc("attach_product_review_invitation_token", {
    p_invitation_id: job.invitation_id,
    p_delivery_generation: job.delivery_generation,
    p_token_hash: hashReviewToken(token),
    p_token_expires_at: expiresAt,
  });
  if (attachError || attached !== true) {
    console.error("Review invitation token could not be attached.", {
      code: attachError?.code ?? "lease_not_owned",
    });
    if (attachError) {
      await finishDelivery(admin, job.invitation_id, job.delivery_generation, "failed", null, "review_token_attach_failed");
    }
    return false;
  }

  const email = getReviewInvitationEmail(job, getReviewLink(token));
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `review-invitation-${job.invitation_id}-${job.delivery_generation}`,
      },
      body: JSON.stringify({
        from,
        to: [job.customer_email],
        reply_to: supportEmail(),
        subject: email.subject,
        html: email.html,
        text: email.text,
        tags: [{ name: "cloverloop_review_invitation_id", value: job.invitation_id }],
      }),
    });
  } catch {
    console.error("Could not reach Resend for review invitation delivery.");
    await finishDelivery(admin, job.invitation_id, job.delivery_generation, "failed", null, "resend_network_error");
    return false;
  }
  if (!response.ok) {
    console.error("Resend rejected review invitation delivery.", { status: response.status });
    await finishDelivery(admin, job.invitation_id, job.delivery_generation, "failed", null, `resend_http_${response.status}`);
    return false;
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    result = null;
  }
  if (!isRecord(result) || typeof result.id !== "string" || !result.id || result.id.length > 200) {
    console.error("Resend returned an invalid review invitation response.");
    await finishDelivery(admin, job.invitation_id, job.delivery_generation, "failed", null, "invalid_resend_response");
    return false;
  }
  return finishDelivery(admin, job.invitation_id, job.delivery_generation, "accepted", result.id, null);
}

export async function processReviewInvitationQueue(
  admin: AdminClient,
  environment: "test" | "live",
  options: { batchSize?: number; sendIntervalMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<ReviewInvitationQueueResult> {
  const empty = { claimed: 0, accepted: 0, failed: 0 };
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from || !isReviewInvitationDeliveryEnabled()) {
    console.error("Review invitation delivery is not enabled or not configured.");
    return empty;
  }

  const { data, error } = await admin.rpc("claim_product_review_invitations", {
    p_environment: environment,
    p_batch_size: options.batchSize ?? reviewInvitationBatchSize(),
  });
  if (error || !Array.isArray(data)) {
    console.error("Review invitations could not be claimed.", { code: error?.code ?? "invalid_response" });
    return empty;
  }

  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const interval = options.sendIntervalMs ?? DEFAULT_SEND_INTERVAL_MS;
  const result = { ...empty };
  for (const [index, row] of data.entries()) {
    const job = parseJob(row);
    if (!job) {
      console.error("A review invitation job was invalid.");
      if (isRecord(row) && typeof row.invitation_id === "string" && typeof row.delivery_generation === "number") {
        await finishDelivery(admin, row.invitation_id, row.delivery_generation, "failed", null, "invalid_review_invitation_job");
      }
      result.failed += 1;
      continue;
    }
    result.claimed += 1;
    if (index > 0 && interval > 0) await sleep(interval);
    if (await sendJob(admin, job, apiKey, from)) result.accepted += 1;
    else result.failed += 1;
  }
  return result;
}
