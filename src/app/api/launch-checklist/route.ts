import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { getLaunchChecklistEmailHtml, launchChecklistEmailText } from "@/lib/launch-checklist-email";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const checklistPdfFilename = "cloverloop-link-in-bio-launch-checklist.pdf";

export async function POST(request: Request) {
  let body: { email?: unknown; marketingConsent?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Please submit a valid email address." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const marketingConsent = body.marketingConsent === true;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    return NextResponse.json(
      { error: "Checklist email delivery is not configured yet. Please try again later." },
      { status: 503 },
    );
  }

  let checklistPdf: Buffer;
  try {
    checklistPdf = await readFile(join(process.cwd(), "public", "downloads", checklistPdfFilename));
  } catch (error) {
    console.error("Could not load the launch checklist PDF for email delivery.", error);
    return NextResponse.json(
      { error: "The checklist email is temporarily unavailable. Please try again later." },
      { status: 500 },
    );
  }

  let emailResponse: Response;
  try {
    const requestId = request.headers.get("Idempotency-Key");
    emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(requestId ? { "Idempotency-Key": requestId } : {}),
      },
      body: JSON.stringify({
        from,
        to: [email],
        reply_to: "info@cloverloop.in",
        subject: "Your link-in-bio store launch checklist",
        html: getLaunchChecklistEmailHtml(),
        text: launchChecklistEmailText,
        attachments: [{ filename: checklistPdfFilename, content: checklistPdf.toString("base64") }],
      }),
    });
  } catch {
    return NextResponse.json(
      { error: "We couldn't reach the email provider. Please try again." },
      { status: 502 },
    );
  }

  if (!emailResponse.ok) {
    return NextResponse.json(
      { error: "The email provider couldn't deliver the checklist. Please try again later." },
      { status: 502 },
    );
  }

  let marketingConsentSaved = !marketingConsent;
  if (marketingConsent) {
    const supabase = createSupabaseAdminClient();
    if (supabase) {
      try {
        const { error } = await supabase
          .from("email_subscriptions")
          .upsert({ email }, { onConflict: "email", ignoreDuplicates: true });
        if (error) {
          console.error("Could not save launch checklist marketing consent.", error.message);
        } else {
          marketingConsentSaved = true;
        }
      } catch (error) {
        console.error(
          "Could not save launch checklist marketing consent.",
          error instanceof Error ? error.message : "Unknown Supabase error.",
        );
      }
    } else {
      console.error("Could not save launch checklist marketing consent: Supabase admin client is not configured.");
    }
  }

  return NextResponse.json({ ok: true, marketingConsentSaved });
}
