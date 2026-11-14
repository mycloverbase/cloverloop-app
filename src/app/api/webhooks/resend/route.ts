import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { verifyResendWebhookSignature } from "@/lib/resend/webhook-signature";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getOrderIdFromTags(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const tag of value) {
      if (isRecord(tag) && tag.name === "cloverloop_order_id" && isUuid(tag.value)) {
        return tag.value;
      }
    }
    return null;
  }
  if (isRecord(value) && isUuid(value.cloverloop_order_id)) {
    return value.cloverloop_order_id;
  }
  return null;
}

function jsonResponse(status: number) {
  return new NextResponse(null, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) return jsonResponse(503);

  const rawBody = await request.text();
  if (!verifyResendWebhookSignature(rawBody, request.headers, secret)) {
    return jsonResponse(400);
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return jsonResponse(400);
  }
  if (!isRecord(event) || typeof event.type !== "string" || !isRecord(event.data)) {
    return jsonResponse(400);
  }

  const statusByType: Record<string, "delivered" | "failed" | "suppressed"> = {
    "email.delivered": "delivered",
    "email.bounced": "failed",
    "email.failed": "failed",
    "email.complained": "suppressed",
  };
  const status = statusByType[event.type];
  if (!status) return jsonResponse(200);

  const eventId = request.headers.get("svix-id");
  const providerEmailId = event.data.email_id;
  if (
    !eventId ||
    eventId.length > 200 ||
    typeof providerEmailId !== "string" ||
    providerEmailId.length < 1 ||
    providerEmailId.length > 200
  ) return jsonResponse(400);

  const admin = createSupabaseAdminClient();
  if (!admin) return jsonResponse(503);

  const { error } = await admin.rpc("record_resend_purchase_email_event", {
    p_event_id: eventId,
    p_event_type: event.type,
    p_order_id: getOrderIdFromTags(event.data.tags),
    p_provider_email_id: providerEmailId,
    p_status: status,
  });
  if (error) {
    console.error("Resend purchase email event could not be persisted.", { code: error.code });
    return jsonResponse(503);
  }
  return jsonResponse(200);
}
