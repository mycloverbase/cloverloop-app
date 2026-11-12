import { NextResponse } from "next/server";
import { checkInstagramRateLimit, getInstagramRequestContext, isRecord, isSameOriginRequest, readJson } from "@/lib/instagram/auth";
import {
  decryptInstagramToken,
  InstagramApiError,
  unsubscribeInstagramComments,
} from "@/lib/instagram/server";

const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  const context = await getInstagramRequestContext();
  if (!context.ok) return context.response;
  const { data, error } = await context.admin
    .from("instagram_connections")
    .select("id,instagram_user_id,instagram_username,token_expires_at,granted_scopes,connection_status,connected_at")
    .eq("creator_id", context.userId)
    .neq("connection_status", "disconnected")
    .order("connected_at", { ascending: false });
  if (error) {
    console.error("Could not load a creator's Instagram connections.", error);
    return NextResponse.json({ error: "Instagram connection status could not be loaded." }, { status: 503, headers: noStore });
  }
  return NextResponse.json({
    configured: Boolean(
      process.env.META_INSTAGRAM_APP_ID &&
      process.env.META_INSTAGRAM_APP_SECRET &&
      process.env.META_INSTAGRAM_WEBHOOK_VERIFY_TOKEN &&
      /^v\d+\.\d+$/.test(process.env.META_GRAPH_API_VERSION ?? "") &&
      Buffer.from(process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY ?? "", "base64").length === 32,
    ),
    connections: data ?? [],
  }, { headers: noStore });
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers: noStore });
  const context = await getInstagramRequestContext();
  if (!context.ok) return context.response;
  const withinLimit = await checkInstagramRateLimit(context.admin, context.userId, "connection-delete", 10);
  if (withinLimit === null) return NextResponse.json({ error: "Instagram services are temporarily unavailable." }, { status: 503, headers: noStore });
  if (!withinLimit) return NextResponse.json({ error: "Too many requests. Wait a minute and try again." }, { status: 429, headers: noStore });
  const body = await readJson(request);
  if (!isRecord(body) || typeof body.connectionId !== "string") {
    return NextResponse.json({ error: "Choose an Instagram connection to disconnect." }, { status: 400, headers: noStore });
  }
  const { data: connection, error: connectionError } = await context.admin
    .from("instagram_connections")
    .select("*")
    .eq("id", body.connectionId)
    .eq("creator_id", context.userId)
    .neq("connection_status", "disconnected")
    .maybeSingle();
  if (connectionError) {
    console.error("Could not load the Instagram account for disconnect.", connectionError);
    return NextResponse.json({ error: "Instagram account could not be disconnected." }, { status: 503, headers: noStore });
  }
  if (!connection) return NextResponse.json({ error: "Instagram connection not found." }, { status: 404, headers: noStore });

  let unsubscribed = true;
  if (connection.access_token_encrypted) {
    try {
      await unsubscribeInstagramComments(
        connection.instagram_user_id,
        decryptInstagramToken(connection.access_token_encrypted),
      );
    } catch (error) {
      unsubscribed = false;
      console.error("Instagram webhook unsubscribe failed during disconnect.", {
        status: error instanceof InstagramApiError ? error.status : null,
        code: error instanceof InstagramApiError ? error.code : null,
      });
    }
  }
  const { error: updateError } = await context.admin
    .from("instagram_connections")
    .update({
      connection_status: "disconnected",
      access_token_encrypted: null,
      disconnected_at: new Date().toISOString(),
    })
    .eq("id", connection.id)
    .eq("creator_id", context.userId);
  if (updateError) {
    console.error("Could not clear the disconnected Instagram credential.", updateError);
    return NextResponse.json({ error: "Instagram account could not be disconnected." }, { status: 503, headers: noStore });
  }
  const { error: pauseError } = await context.admin
    .from("instagram_automations")
    .update({ status: "paused" })
    .eq("instagram_connection_id", connection.id)
    .eq("creator_id", context.userId);
  if (pauseError) {
    console.error("Could not pause automations after Instagram disconnect.", pauseError);
    return NextResponse.json({ error: "Account disconnected, but some automations could not be paused." }, { status: 503, headers: noStore });
  }
  return NextResponse.json({
    disconnected: true,
    warning: unsubscribed ? null : "CloverLoop disconnected the account locally but could not confirm Meta webhook unsubscription.",
  }, { headers: noStore });
}
