import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { noStoreHeaders } from "@/lib/free-products/server";

export const runtime = "nodejs";

type DueReminder = {
  programme_id: string;
  creator_id: string;
  creator_email: string;
  creator_name: string;
  expires_at: string;
  reminder_days: number;
};

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
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

function reminderEmail(creatorName: string, days: number, expiresAt: string) {
  const safeName = escapeHtml(creatorName);
  const expiryDate = new Date(expiresAt).toLocaleDateString("en-IN", {
    dateStyle: "long",
    timeZone: "Asia/Kolkata",
  });
  const daysText = days === 1 ? "1 day" : `${days} days`;
  const subject = `Your Founding Creator fee waiver expires in ${daysText}`;
  const feeTerms = "After expiry, your Creator plan and unlimited listings will continue. The standard 4% CloverLoop platform transaction fee applies unless a Pro Creator subscription is active. CloverLoop will not start a subscription automatically.";
  const text = `Hi ${creatorName},\n\nYour Founding Creator Programme benefits expire on ${expiryDate} (${daysText} from now). ${feeTerms}\n\nThe CloverLoop team`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head><body style="margin:0;background:#f3f1e4;font-family:Arial,sans-serif;color:#14382b"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px"><tr><td align="center"><table role="presentation" width="600" style="max-width:600px;background:#fbfaf5;border:1px solid #d3dbc8;border-radius:14px"><tr><td style="padding:32px"><img src="https://cloverloop.in/images/brand/logo.png" width="150" alt="CloverLoop"><h1 style="font-size:26px">Your Founding Creator benefits expire in ${daysText}</h1><p>Hi ${safeName},</p><p>Your Founding Creator Programme benefits expire on <strong>${expiryDate}</strong>.</p><p>${escapeHtml(feeTerms)}</p><p>The CloverLoop team</p></td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}

export async function GET(request: Request) {
  const headers = noStoreHeaders();
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers });
  }
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Programme services are unavailable." }, { status: 503, headers });
  }

  const { data: expired, error: expiryError } = await supabase.rpc("expire_founding_creator_programmes");
  if (expiryError) {
    console.error("Could not expire Founding Creator Programme memberships.", expiryError);
    return NextResponse.json({ error: "Programme expiry processing failed." }, { status: 503, headers });
  }
  const { data: reminders, error: reminderError } = await supabase.rpc("claim_founding_programme_reminders");
  if (reminderError) {
    console.error("Could not claim Founding Creator expiry reminders.", reminderError);
    return NextResponse.json({ error: "Programme reminder processing failed." }, { status: 503, headers });
  }
  if (!Array.isArray(reminders)) {
    console.error("The Founding Creator reminder response was invalid.");
    return NextResponse.json({ error: "Programme reminder processing failed." }, { status: 503, headers });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (reminders.length && (!apiKey || !from)) {
    for (const reminder of reminders as DueReminder[]) {
      const { error } = await supabase.rpc("finish_founding_programme_reminder", {
        requested_programme_id: reminder.programme_id,
        requested_reminder_days: reminder.reminder_days,
        requested_sent: false,
      });
      if (error) console.error("Could not release a Founding Creator reminder for retry.", error);
    }
    return NextResponse.json({ error: "Programme reminder email is not configured." }, { status: 503, headers });
  }

  let sentCount = 0;
  let failedCount = 0;
  for (const reminder of reminders as DueReminder[]) {
    const email = reminderEmail(reminder.creator_name || "Creator", reminder.reminder_days, reminder.expires_at);
    let sent = false;
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `founding-programme-${reminder.programme_id}-${reminder.reminder_days}`,
        },
        body: JSON.stringify({
          from,
          to: [reminder.creator_email],
          reply_to: "info@cloverloop.in",
          subject: email.subject,
          html: email.html,
          text: email.text,
        }),
      });
      sent = response.ok;
      if (!sent) console.error("Resend rejected a Founding Creator expiry reminder.", { status: response.status });
    } catch (error) {
      console.error("Could not reach Resend for a Founding Creator expiry reminder.", error);
    }
    const { error: finishError } = await supabase.rpc("finish_founding_programme_reminder", {
      requested_programme_id: reminder.programme_id,
      requested_reminder_days: reminder.reminder_days,
      requested_sent: sent,
    });
    if (finishError) console.error("Could not record a Founding Creator reminder result.", finishError);
    if (sent) sentCount += 1;
    else failedCount += 1;
  }

  return NextResponse.json({
    expired: typeof expired === "number" ? expired : 0,
    remindersSent: sentCount,
    remindersFailed: failedCount,
  }, { headers });
}
