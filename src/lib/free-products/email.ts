import "server-only";
import { createHash } from "node:crypto";
import { SITE_URL } from "@/lib/site";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

export type FreeProductEmailInput = {
  email: string;
  creatorName: string;
  productName: string;
  token: string;
  expiryHours: number;
};

export function getFreeProductDownloadLink(token: string): string {
  const downloadPage = new URL("/free-product-download", SITE_URL);
  return `${downloadPage.toString()}#token=${encodeURIComponent(token)}`;
}

export function getFreeProductEmail(input: FreeProductEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const productName = input.productName.trim();
  const subjectProductName = productName.replace(/[\r\n\t]+/g, " ").slice(0, 100);
  const creatorName = input.creatorName.trim();
  const downloadLink = getFreeProductDownloadLink(input.token);
  const safeProductName = escapeHtml(productName);
  const safeCreatorName = escapeHtml(creatorName);
  const safeDownloadLink = escapeHtml(downloadLink);
  const expiryText = `${input.expiryHours} ${input.expiryHours === 1 ? "hour" : "hours"}`;

  return {
    subject: `Your free product is ready – ${subjectProductName}`,
    html: `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>Your free product is ready</title>
<style>body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table,td{mso-table-lspace:0;mso-table-rspace:0}@media only screen and (max-width:620px){.wrap{width:100%!important}.pad{padding-left:22px!important;padding-right:22px!important}h1{font-size:26px!important}}</style></head>
<body style="margin:0;padding:0;background:#f3f1e4;font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#14382b">
<div style="display:none;max-height:0;overflow:hidden">Your download of ${safeProductName} is ready.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f3f1e4"><tr><td align="center" style="padding:28px 12px 36px">
<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px">
<tr><td class="pad" style="padding:0 4px 22px"><a href="https://cloverloop.in" style="text-decoration:none;color:#1b4332;font-size:24px;font-weight:700">CloverLoop</a></td></tr>
<tr><td bgcolor="#fbfaf5" style="background:#fbfaf5;border:1px solid #d3dbc8;border-top:4px solid #a8c5a0;border-radius:14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td class="pad" style="padding:32px 36px 8px"><h1 style="margin:0 0 16px;font-size:30px;line-height:1.15;font-weight:600;color:#14382b">Your free product is ready</h1>
<p style="margin:0 0 14px;font-size:16px;line-height:1.55">Hi,</p>
<p style="margin:0 0 14px;font-size:16px;line-height:1.55">You&apos;ve successfully claimed <strong>${safeProductName}</strong> from ${safeCreatorName}.</p>
<p style="margin:0 0 14px;font-size:16px;line-height:1.55">Your download is ready.</p></td></tr>
<tr><td class="pad" style="padding:18px 36px 12px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#1b4332" style="background:#1b4332;border-radius:10px"><a href="${safeDownloadLink}" style="display:inline-block;padding:14px 26px;color:#f3f1e4;font-size:16px;font-weight:600;text-decoration:none">Download Your Product</a></td></tr></table></td></tr>
<tr><td class="pad" style="padding:12px 36px 30px;font-size:14px;line-height:1.6;color:#4f6157"><p style="margin:0 0 12px">This download link expires in ${input.expiryHours} hours and can be used up to the allowed download limit. If it expires, request a new link through the original product storefront, subject to availability and claim limits.</p><p style="margin:0">Enjoy!<br>The CloverLoop team</p></td></tr>
</table></td></tr>
<tr><td class="pad" align="center" style="padding:22px 24px 0;font-size:12px;line-height:1.6;color:#4f6157">You&apos;re receiving this email because you requested a free product on <a href="https://cloverloop.in" style="color:#4f6157">cloverloop.in</a>.<br>CloverLoop, info@cloverloop.in</td></tr>
</table></td></tr></table></body></html>`,
    text: `Hi,

You've successfully claimed ${productName} from ${creatorName}.

Your download is ready:
${downloadLink}

This download link expires in ${expiryText} and can be used up to the allowed download limit. If it expires, request a new link through the original product storefront, subject to availability and claim limits.

Enjoy!
The CloverLoop team`,
  };
}

export async function sendFreeProductEmail(input: FreeProductEmailInput): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    console.error("Free product email delivery is not configured.");
    return false;
  }

  let response: Response;
  try {
    const email = getFreeProductEmail(input);
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `free-product-${createHash("sha256").update(input.token).digest("hex")}`,
      },
      body: JSON.stringify({
        from,
        to: [input.email],
        reply_to: "info@cloverloop.in",
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    });
  } catch (error) {
    console.error("Could not reach Resend for free product delivery.", error);
    return false;
  }
  if (!response.ok) {
    console.error("Resend rejected free product delivery.", { status: response.status });
    return false;
  }
  return true;
}
