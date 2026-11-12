import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { checkInstagramRateLimit } from "@/lib/instagram/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getInstagramConfig,
  parseInstagramCommentNotifications,
  verifyInstagramWebhookSignature,
} from "@/lib/instagram/server";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameSecret(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: NextRequest) {
  const config = getInstagramConfig();
  const { searchParams } = request.nextUrl;
  const mode = searchParams.get("hub.mode");
  const verifyToken = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  if (
    !config ||
    mode !== "subscribe" ||
    !verifyToken ||
    !challenge ||
    !sameSecret(verifyToken, config.webhookVerifyToken)
  ) {
    return new Response("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  return new Response(challenge, { status: 200, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const config = getInstagramConfig();
  if (!config) return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });
  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > 1_000_000) {
    return NextResponse.json({ error: "Webhook payload is too large." }, { status: 413 });
  }
  if (!verifyInstagramWebhookSignature(body, request.headers.get("x-hub-signature-256"), config.appSecret)) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  }
  if (!isRecord(payload) || payload.object !== "instagram" || !Array.isArray(payload.entry)) {
    return NextResponse.json({ error: "Invalid webhook payload structure." }, { status: 400 });
  }
  const notifications = parseInstagramCommentNotifications(payload);
  if (!notifications.length) return NextResponse.json({ received: true }, { status: 200 });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Webhook processing is temporarily unavailable." }, { status: 503 });
  const accountIds = [...new Set(notifications.map((notification) => notification.instagramUserId))];
  const { data: connections, error: connectionError } = await admin
    .from("instagram_connections")
    .select("id,creator_id,instagram_user_id")
    .eq("connection_status", "connected")
    .in("instagram_user_id", accountIds);
  if (connectionError) {
    console.error("Could not resolve Instagram webhook accounts.", connectionError);
    return NextResponse.json({ error: "Webhook processing is temporarily unavailable." }, { status: 503 });
  }
  const connectionByInstagramId = new Map((connections ?? []).map((connection) => [connection.instagram_user_id, connection.id]));
  const connectionById = new Map((connections ?? []).map((connection) => [connection.id, connection]));
  for (const connectionId of new Set(connectionByInstagramId.values())) {
    const connection = connectionById.get(connectionId);
    if (!connection) continue;
    const withinLimit = await checkInstagramRateLimit(
      admin,
      connection.creator_id,
      `webhook-${connection.id}`,
      1200,
    );
    if (withinLimit === null) {
      return NextResponse.json({ error: "Webhook processing is temporarily unavailable." }, { status: 503 });
    }
    if (!withinLimit) {
      return NextResponse.json({ error: "Webhook delivery rate exceeded." }, { status: 429 });
    }
  }
  const events = notifications.flatMap((notification) => {
    const connectionId = connectionByInstagramId.get(notification.instagramUserId);
    return connectionId
      ? [{
          instagram_connection_id: connectionId,
          instagram_comment_id: notification.commentId,
          instagram_media_id: notification.mediaId,
          commenter_id: notification.commenterId,
          comment_text: notification.text,
          comment_timestamp: notification.timestamp,
        }]
      : [];
  });
  if (events.length) {
    const { error } = await admin
      .from("instagram_comment_events")
      .upsert(events, {
        onConflict: "instagram_connection_id,instagram_comment_id",
        ignoreDuplicates: true,
      });
    if (error) {
      console.error("Could not enqueue verified Instagram comment notifications.", error);
      return NextResponse.json({ error: "Webhook processing is temporarily unavailable." }, { status: 503 });
    }
  }
  return NextResponse.json({ received: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
