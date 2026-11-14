import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/site";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type PurchaseEmailJob = {
  order_id: string;
  delivery_generation: number;
  customer_email: string;
  customer_name: string | null;
  product_name: string;
  storefront_name: string;
  amount_paise: number;
  currency: string;
  razorpay_order_id: string;
  expires_at: string;
  max_downloads: number;
};

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

function downloadSecret(): string | null {
  const secret = process.env.PURCHASE_DOWNLOAD_LINK_SECRET?.trim();
  return secret && Buffer.byteLength(secret) >= 32 ? secret : null;
}

export function isRazorpayPurchaseEmailDeliveryConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY?.trim() &&
    process.env.RESEND_FROM_EMAIL?.trim() &&
    process.env.RESEND_WEBHOOK_SECRET?.trim() &&
    downloadSecret(),
  );
}

export function createPurchaseDownloadTicket(orderId: string, expiresAt: number): string | null {
  const secret = downloadSecret();
  if (!secret || !Number.isSafeInteger(expiresAt)) return null;
  return createHmac("sha256", secret)
    .update(`${orderId}.${expiresAt}`)
    .digest("base64url");
}

export function verifyPurchaseDownloadTicket(
  orderId: string,
  expiresAt: number,
  signature: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId) ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= nowSeconds ||
    !/^[A-Za-z0-9_-]{43}$/.test(signature)
  ) return false;
  const expected = createPurchaseDownloadTicket(orderId, expiresAt);
  if (!expected) return false;
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(signature);
  return expectedBytes.length === providedBytes.length &&
    timingSafeEqual(expectedBytes, providedBytes);
}

function getDownloadLink(orderId: string, expiresAt: number, signature: string): string {
  const url = new URL("/purchase-download", SITE_URL);
  url.hash = new URLSearchParams({
    orderId,
    expiresAt: String(expiresAt),
    signature,
  }).toString();
  return url.toString();
}

function getEmail(job: PurchaseEmailJob, downloadLink: string): {
  subject: string;
  html: string;
  text: string;
} {
  const productName = job.product_name.trim();
  const creatorName = job.storefront_name.trim();
  const customerName = job.customer_name?.trim() || "there";
  const subjectProductName = productName.replace(/[\r\n\t]+/g, " ").slice(0, 100);
  const amount = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: job.currency,
  }).format(job.amount_paise / 100);
  const expiresAt = new Date(job.expires_at);
  const expiryLabel = expiresAt.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
  const safeProductName = escapeHtml(productName);
  const safeCreatorName = escapeHtml(creatorName);
  const safeCustomerName = escapeHtml(customerName);
  const safeOrderId = escapeHtml(job.razorpay_order_id);
  const safeAmount = escapeHtml(amount);
  const safeDownloadLink = escapeHtml(downloadLink);
  const supportEmail = escapeHtml(process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "info@cloverloop.in");
  return {
    subject: `Your purchase is ready – ${subjectProductName}`,
    html: `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>Your purchase is ready</title>
<style>body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table,td{mso-table-lspace:0;mso-table-rspace:0}@media only screen and (max-width:620px){.wrap{width:100%!important}.pad{padding-left:22px!important;padding-right:22px!important}h1{font-size:26px!important}}</style></head>
<body style="margin:0;padding:0;background:#f3f1e4;font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#14382b">
<div style="display:none;max-height:0;overflow:hidden">Your download of ${safeProductName} is ready.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f3f1e4"><tr><td align="center" style="padding:28px 12px 36px">
<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px">
<tr><td class="pad" style="padding:0 4px 22px"><a href="https://cloverloop.in" style="text-decoration:none;color:#1b4332;font-size:24px;font-weight:700">CloverLoop</a></td></tr>
<tr><td bgcolor="#fbfaf5" style="background:#fbfaf5;border:1px solid #d3dbc8;border-top:4px solid #a8c5a0;border-radius:14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td class="pad" style="padding:32px 36px 8px"><h1 style="margin:0 0 16px;font-size:30px;line-height:1.15;font-weight:600;color:#14382b">Your purchase is ready</h1>
<p style="margin:0 0 14px;font-size:16px;line-height:1.55">Hi ${safeCustomerName},</p>
<p style="margin:0 0 14px;font-size:16px;line-height:1.55">Your payment for <strong>${safeProductName}</strong> from ${safeCreatorName} has been verified.</p>
<p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#4f6157">Order reference: ${safeOrderId}<br>Amount paid: ${safeAmount}</p></td></tr>
<tr><td class="pad" style="padding:18px 36px 12px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#1b4332" style="background:#1b4332;border-radius:10px"><a href="${safeDownloadLink}" style="display:inline-block;padding:14px 26px;color:#f3f1e4;font-size:16px;font-weight:600;text-decoration:none">Download Product</a></td></tr></table></td></tr>
<tr><td class="pad" style="padding:12px 36px 30px;font-size:14px;line-height:1.6;color:#4f6157"><p style="margin:0 0 12px">This secure link expires on ${escapeHtml(expiryLabel)} and can be used up to ${job.max_downloads} times. The link does not reveal the product's storage location.</p><p style="margin:0">Need help? Contact <a href="mailto:${supportEmail}" style="color:#1b4332">${supportEmail}</a>.<br>The CloverLoop team</p></td></tr>
</table></td></tr>
<tr><td class="pad" align="center" style="padding:22px 24px 0;font-size:12px;line-height:1.6;color:#4f6157">You&apos;re receiving this email because you purchased a product on <a href="https://cloverloop.in" style="color:#4f6157">cloverloop.in</a>.<br>CloverLoop, ${supportEmail}</td></tr>
</table></td></tr></table></body></html>`,
    text: `Hi ${customerName},

Your payment for ${productName} from ${creatorName} has been verified.

Order reference: ${job.razorpay_order_id}
Amount paid: ${amount}

Download your product:
${downloadLink}

This secure link expires on ${expiryLabel} and can be used up to ${job.max_downloads} times.
Need help? Contact ${process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "info@cloverloop.in"}.

The CloverLoop team`,
  };
}

function parseJob(value: unknown): PurchaseEmailJob | null {
  if (!isRecord(value)) return null;
  const {
    order_id: orderId,
    delivery_generation: generation,
    customer_email: customerEmail,
    customer_name: customerName,
    product_name: productName,
    storefront_name: storefrontName,
    amount_paise: amountPaise,
    currency,
    razorpay_order_id: razorpayOrderId,
    expires_at: expiresAt,
    max_downloads: maxDownloads,
  } = value;
  if (
    typeof orderId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId) ||
    typeof generation !== "number" ||
    !Number.isSafeInteger(generation) ||
    generation < 0 ||
    typeof customerEmail !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail) ||
    (customerName !== null && typeof customerName !== "string") ||
    typeof productName !== "string" ||
    typeof storefrontName !== "string" ||
    typeof amountPaise !== "number" ||
    !Number.isSafeInteger(amountPaise) ||
    amountPaise <= 0 ||
    currency !== "INR" ||
    typeof razorpayOrderId !== "string" ||
    typeof expiresAt !== "string" ||
    !Number.isFinite(new Date(expiresAt).getTime()) ||
    new Date(expiresAt).getTime() <= Date.now() ||
    typeof maxDownloads !== "number" ||
    !Number.isSafeInteger(maxDownloads) ||
    maxDownloads < 1 ||
    maxDownloads > 20
  ) return null;
  return {
    order_id: orderId,
    delivery_generation: generation,
    customer_email: customerEmail,
    customer_name: customerName,
    product_name: productName,
    storefront_name: storefrontName,
    amount_paise: amountPaise,
    currency,
    razorpay_order_id: razorpayOrderId,
    expires_at: expiresAt,
    max_downloads: maxDownloads,
  };
}

async function finishDelivery(
  admin: AdminClient,
  orderId: string,
  generation: number,
  status: "accepted" | "failed",
  providerEmailId: string | null,
  errorCode: string | null,
): Promise<boolean> {
  const { data, error } = await admin.rpc("finish_razorpay_purchase_email_delivery", {
    p_order_id: orderId,
    p_delivery_generation: generation,
    p_status: status,
    p_provider_email_id: providerEmailId,
    p_error_code: errorCode,
  });
  if (error || data !== true) {
    console.error("Purchase email delivery state could not be saved.", {
      code: error?.code ?? "lease_not_owned",
    });
    return false;
  }
  return true;
}

async function sendJob(
  admin: AdminClient,
  job: PurchaseEmailJob,
  apiKey: string,
  from: string,
): Promise<boolean> {
  const expirySeconds = Math.floor(new Date(job.expires_at).getTime() / 1000);
  const signature = createPurchaseDownloadTicket(job.order_id, expirySeconds);
  if (!signature) {
    return finishDelivery(admin, job.order_id, job.delivery_generation, "failed", null, "download_link_not_configured");
  }

  const email = getEmail(job, getDownloadLink(job.order_id, expirySeconds, signature));
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `purchase-${job.order_id}-${job.delivery_generation}`,
      },
      body: JSON.stringify({
        from,
        to: [job.customer_email],
        reply_to: process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "info@cloverloop.in",
        subject: email.subject,
        html: email.html,
        text: email.text,
        tags: [{ name: "cloverloop_order_id", value: job.order_id }],
      }),
    });
  } catch {
    console.error("Could not reach Resend for purchase email delivery.");
    return finishDelivery(admin, job.order_id, job.delivery_generation, "failed", null, "resend_network_error");
  }
  if (!response.ok) {
    console.error("Resend rejected purchase email delivery.", { status: response.status });
    return finishDelivery(
      admin,
      job.order_id,
      job.delivery_generation,
      "failed",
      null,
      `resend_http_${response.status}`,
    );
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    console.error("Resend returned an invalid purchase email response.");
    return finishDelivery(admin, job.order_id, job.delivery_generation, "failed", null, "invalid_resend_response");
  }
  if (!isRecord(result) || typeof result.id !== "string" || result.id.length > 200) {
    console.error("Resend returned an invalid purchase email response.");
    return finishDelivery(admin, job.order_id, job.delivery_generation, "failed", null, "invalid_resend_response");
  }
  return finishDelivery(admin, job.order_id, job.delivery_generation, "accepted", result.id, null);
}

export async function processRazorpayPurchaseEmailQueue(
  admin: AdminClient,
  orderId: string | null = null,
  batchSize = 5,
): Promise<{ claimed: number; accepted: number; failed: number }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from || !isRazorpayPurchaseEmailDeliveryConfigured()) {
    console.error("Purchase email delivery is not configured.");
    return { claimed: 0, accepted: 0, failed: 0 };
  }

  const { data, error } = await admin.rpc("claim_razorpay_purchase_email_deliveries", {
    p_order_id: orderId,
    p_batch_size: batchSize,
  });
  if (error) {
    console.error("Purchase email deliveries could not be claimed.", { code: error.code });
    return { claimed: 0, accepted: 0, failed: 0 };
  }
  if (!Array.isArray(data)) {
    console.error("Purchase email delivery claim response was invalid.");
    return { claimed: 0, accepted: 0, failed: 0 };
  }

  const validJobs: PurchaseEmailJob[] = [];
  for (const row of data) {
    const job = parseJob(row);
    if (job) {
      validJobs.push(job);
      continue;
    }
    console.error("A purchase email delivery job was invalid.");
    if (
      isRecord(row) &&
      typeof row.order_id === "string" &&
      typeof row.delivery_generation === "number" &&
      Number.isSafeInteger(row.delivery_generation)
    ) {
      await finishDelivery(
        admin,
        row.order_id,
        row.delivery_generation,
        "failed",
        null,
        "invalid_purchase_email_job",
      );
    }
  }
  const results = await Promise.all(validJobs.map((job) => sendJob(admin, job, apiKey, from)));
  return {
    claimed: validJobs.length,
    accepted: results.filter(Boolean).length,
    failed: results.filter((result) => !result).length,
  };
}
