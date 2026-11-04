import { NextResponse } from "next/server";

export const runtime = "nodejs";

const checklistItems = [
  "Choose one specific customer problem to solve.",
  "Define the audience and the outcome your offer supports.",
  "Select a format that fits the product and customer need.",
  "Check similar offers and write down what makes yours useful.",
  "Set a price after considering value, costs and support.",
  "List every included file, format and software requirement.",
  "Use clear file names and add a start-here guide.",
  "Test links, files and instructions on a separate account.",
  "Confirm you have rights to all included content and assets.",
  "Write an honest product description with useful previews.",
  "Decide how you will answer questions and handle refunds.",
  "Choose the channels where your intended audience spends time.",
  "Prepare a useful demonstration and launch messages.",
  "Review provider charges, applicable taxes and operating costs.",
  "Set a date to review feedback and improve the offer.",
];

function createChecklistPdf() {
  const content = [
    "BT",
    "/F1 17 Tf",
    "50 748 Td",
    "(CloverLoop Free Launch Checklist) Tj",
    "/F1 10 Tf",
    "0 -28 Td",
    "(Use these prompts to plan a clear, practical first launch.) Tj",
    ...checklistItems.flatMap((item) => ["0 -27 Td", `([ ] ${item.replace(/[()\\]/g, "\\$&")}) Tj`]),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content, "ascii") + 1} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "ascii"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "ascii").toString("base64");
}

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
        subject: "Your CloverLoop free launch checklist",
        text: `Here is your CloverLoop free launch checklist.\n\n${checklistItems.map((item) => `[ ] ${item}`).join("\n")}\n\nThe attached PDF is also ready to save or print.`,
        attachments: [{ filename: "cloverloop-free-launch-checklist.pdf", content: createChecklistPdf() }],
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
    const audienceId = process.env.RESEND_AUDIENCE_ID;
    if (audienceId) {
      try {
        const contactResponse = await fetch(
          `https://api.resend.com/audiences/${encodeURIComponent(audienceId)}/contacts`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ email, unsubscribed: false }),
          },
        );
        marketingConsentSaved = contactResponse.ok;
      } catch {
        marketingConsentSaved = false;
      }
    }
  }

  return NextResponse.json({ ok: true, marketingConsentSaved });
}
