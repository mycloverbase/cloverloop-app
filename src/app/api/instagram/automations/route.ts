import { NextResponse } from "next/server";
import { checkInstagramRateLimit, getInstagramRequestContext, isSameOriginRequest, markInstagramConnectionRequiresReauthorization, readJson } from "@/lib/instagram/auth";
import {
  decryptInstagramToken,
  getInstagramMedia,
} from "@/lib/instagram/server";
import { parseInstagramAutomationInput } from "@/lib/instagram/validation";

const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  const context = await getInstagramRequestContext();
  if (!context.ok) return context.response;
  const { data: automations, error } = await context.admin
    .from("instagram_automations")
    .select("id,instagram_connection_id,name,media_id,media_type,media_permalink,media_caption,trigger_keywords,match_type,reply_message,target_product_id,status,total_comments_received,total_comments_matched,total_messages_sent,total_messages_failed,created_at,updated_at")
    .eq("creator_id", context.userId)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) {
    console.error("Could not load Instagram automations.", error);
    return NextResponse.json({ error: "Instagram automations could not be loaded." }, { status: 503, headers: noStore });
  }
  const connectionIds = [...new Set((automations ?? []).map((automation) => automation.instagram_connection_id))];
  const { data: connections, error: connectionError } = connectionIds.length
    ? await context.admin
      .from("instagram_connections")
      .select("id,instagram_username,connection_status")
      .eq("creator_id", context.userId)
      .in("id", connectionIds)
    : { data: [], error: null };
  if (connectionError) {
    console.error("Could not load Instagram account labels for automations.", connectionError);
    return NextResponse.json({ error: "Instagram automation accounts could not be loaded." }, { status: 503, headers: noStore });
  }
  const connectionById = new Map((connections ?? []).map((connection) => [connection.id, connection]));
  const automationIds = (automations ?? []).map((automation) => automation.id);
  const { data: failures, error: failuresError } = automationIds.length
    ? await context.admin
      .from("instagram_comment_events")
      .select("automation_id,error_code,error_message,created_at")
      .in("automation_id", automationIds)
      .eq("processing_status", "failed")
      .order("created_at", { ascending: false })
      .limit(100)
    : { data: [], error: null };
  if (failuresError) {
    console.error("Could not load Instagram automation delivery failures.", failuresError);
    return NextResponse.json({ error: "Instagram automation analytics could not be loaded." }, { status: 503, headers: noStore });
  }
  const failuresByAutomation = new Map<string, Array<{ code: string | null; message: string | null; createdAt: string }>>();
  for (const failure of failures ?? []) {
    if (!failure.automation_id) continue;
    const current = failuresByAutomation.get(failure.automation_id) ?? [];
    if (current.length < 3) {
      current.push({ code: failure.error_code, message: failure.error_message, createdAt: failure.created_at });
      failuresByAutomation.set(failure.automation_id, current);
    }
  }
  return NextResponse.json({
    automations: (automations ?? []).map((automation) => ({
      ...automation,
      instagram_username: connectionById.get(automation.instagram_connection_id)?.instagram_username ?? "Disconnected account",
      connection_status: connectionById.get(automation.instagram_connection_id)?.connection_status ?? "disconnected",
      recentFailures: failuresByAutomation.get(automation.id) ?? [],
    })),
  }, { headers: noStore });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers: noStore });
  const context = await getInstagramRequestContext();
  if (!context.ok) return context.response;
  const withinLimit = await checkInstagramRateLimit(context.admin, context.userId, "automation-write", 30);
  if (withinLimit === null) return NextResponse.json({ error: "Instagram services are temporarily unavailable." }, { status: 503, headers: noStore });
  if (!withinLimit) return NextResponse.json({ error: "Too many automation changes. Wait a minute and try again." }, { status: 429, headers: noStore });
  const body = await readJson(request);
  const parsed = parseInstagramAutomationInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.message }, { status: 400, headers: noStore });

  const { data: connection, error: connectionError } = await context.admin
    .from("instagram_connections")
    .select("*")
    .eq("id", parsed.value.connectionId)
    .eq("creator_id", context.userId)
    .eq("connection_status", "connected")
    .maybeSingle();
  if (connectionError) {
    console.error("Could not validate an Instagram automation connection.", connectionError);
    return NextResponse.json({ error: "Instagram account could not be verified." }, { status: 503, headers: noStore });
  }
  if (!connection?.access_token_encrypted) {
    return NextResponse.json({ error: "Reconnect the Instagram account before creating an automation." }, { status: 409, headers: noStore });
  }
  if (Date.parse(connection.token_expires_at) <= Date.now() + 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "Refresh or reconnect the Instagram account before creating an automation." }, { status: 409, headers: noStore });
  }
  let selectedMedia;
  try {
    const media = await getInstagramMedia(
      connection.instagram_user_id,
      decryptInstagramToken(connection.access_token_encrypted),
    );
    selectedMedia = media.find((item) => item.id === parsed.value.mediaId);
  } catch (error) {
    if (error instanceof Error && "status" in error && error.status === 401) {
      await markInstagramConnectionRequiresReauthorization(context.admin, connection.id);
    }
    console.error("Could not verify the selected Instagram media.", {
      status: error instanceof Error && "status" in error ? error.status : null,
    });
    return NextResponse.json({ error: "Instagram media could not be verified. Refresh the post list and try again." }, { status: 502, headers: noStore });
  }
  if (!selectedMedia || selectedMedia.media_type !== parsed.value.mediaType) {
    return NextResponse.json({ error: "The selected post or Reel is not available on this Instagram account." }, { status: 400, headers: noStore });
  }
  if (parsed.value.targetProductId) {
    const { data: product, error: productError } = await context.admin
      .from("storefront_products")
      .select("id")
      .eq("id", parsed.value.targetProductId)
      .eq("user_id", context.userId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle();
    if (productError || !product) {
      if (productError) console.error("Could not verify the selected storefront product.", productError);
      return NextResponse.json({ error: "Choose an active product from your published storefront." }, { status: 400, headers: noStore });
    }
  }
  const { data: storefront, error: storefrontError } = await context.admin
    .from("creator_storefronts")
    .select("id,username")
    .eq("user_id", context.userId)
    .eq("status", "published")
    .is("deleted_at", null)
    .maybeSingle();
  if (storefrontError) {
    console.error("Could not verify the published storefront for an Instagram automation.", storefrontError);
    return NextResponse.json({ error: "Published storefront could not be verified." }, { status: 503, headers: noStore });
  }
  if (!storefront?.username) {
    return NextResponse.json({ error: "Publish your storefront before activating an Instagram automation." }, { status: 400, headers: noStore });
  }
  const linkPath = parsed.value.targetProductId
    ? `/${storefront.username}#product-${parsed.value.targetProductId}`
    : `/${storefront.username}#products`;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (!siteUrl || [...`${parsed.value.replyMessage.trim()}\n${siteUrl}${linkPath}`].length > 1000) {
    return NextResponse.json({ error: "The complete private reply and CloverLoop link must be 1,000 characters or fewer." }, { status: 400, headers: noStore });
  }

  const { data: automation, error } = await context.admin
    .from("instagram_automations")
    .insert({
      creator_id: context.userId,
      instagram_connection_id: connection.id,
      name: parsed.value.name,
      media_id: selectedMedia.id,
      media_type: selectedMedia.media_type,
      media_permalink: selectedMedia.permalink,
      media_caption: selectedMedia.caption ?? "",
      trigger_keywords: parsed.value.keywords,
      match_type: parsed.value.matchType,
      reply_message: parsed.value.replyMessage,
      target_product_id: parsed.value.targetProductId,
      status: parsed.value.status,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "P0001") {
      return NextResponse.json({ error: "An active automation already uses one of those keywords on this post." }, { status: 409, headers: noStore });
    }
    console.error("Could not save an Instagram automation.", error);
    return NextResponse.json({ error: "Instagram automation could not be saved." }, { status: 503, headers: noStore });
  }
  return NextResponse.json({ id: automation.id }, { status: 201, headers: noStore });
}
