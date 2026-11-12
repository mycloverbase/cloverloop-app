import { NextResponse } from "next/server";
import { checkInstagramRateLimit, getInstagramRequestContext, isSameOriginRequest, markInstagramConnectionRequiresReauthorization, readJson } from "@/lib/instagram/auth";
import { decryptInstagramToken, getInstagramMedia, isInstagramAuthorizationError } from "@/lib/instagram/server";
import { parseInstagramAutomationInput } from "@/lib/instagram/validation";

const noStore = { "Cache-Control": "no-store" };

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, routeContext: RouteContext) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers: noStore });
  const context = await getInstagramRequestContext();
  if (!context.ok) return context.response;
  const withinLimit = await checkInstagramRateLimit(context.admin, context.userId, "automation-write", 30);
  if (withinLimit === null) return NextResponse.json({ error: "Instagram services are temporarily unavailable." }, { status: 503, headers: noStore });
  if (!withinLimit) return NextResponse.json({ error: "Too many automation changes. Wait a minute and try again." }, { status: 429, headers: noStore });
  const { id } = await routeContext.params;
  const parsed = parseInstagramAutomationInput(await readJson(request));
  if (!parsed.ok) return NextResponse.json({ error: parsed.message }, { status: 400, headers: noStore });

  const { data: current, error: currentError } = await context.admin
    .from("instagram_automations")
    .select("id")
    .eq("id", id)
    .eq("creator_id", context.userId)
    .maybeSingle();
  if (currentError) {
    console.error("Could not verify Instagram automation ownership.", currentError);
    return NextResponse.json({ error: "Instagram automation could not be loaded." }, { status: 503, headers: noStore });
  }
  if (!current) return NextResponse.json({ error: "Instagram automation not found." }, { status: 404, headers: noStore });

  const { data: connection, error: connectionError } = await context.admin
    .from("instagram_connections")
    .select("*")
    .eq("id", parsed.value.connectionId)
    .eq("creator_id", context.userId)
    .eq("connection_status", "connected")
    .maybeSingle();
  if (connectionError) {
    console.error("Could not validate the Instagram account for automation update.", connectionError);
    return NextResponse.json({ error: "Instagram account could not be verified." }, { status: 503, headers: noStore });
  }
  if (!connection?.access_token_encrypted) {
    return NextResponse.json({ error: "Reconnect the Instagram account before editing this automation." }, { status: 409, headers: noStore });
  }

  let media;
  try {
    media = await getInstagramMedia(
      connection.instagram_user_id,
      decryptInstagramToken(connection.access_token_encrypted),
    );
  } catch (error) {
    if (isInstagramAuthorizationError(error)) {
      await markInstagramConnectionRequiresReauthorization(context.admin, connection.id);
    }
    console.error("Could not verify Instagram media for automation update.", {
      status: error instanceof Error && "status" in error ? error.status : null,
    });
    return NextResponse.json({ error: "Instagram media could not be verified." }, { status: 502, headers: noStore });
  }
  const selectedMedia = media.find((item) => item.id === parsed.value.mediaId);
  if (!selectedMedia || selectedMedia.media_type !== parsed.value.mediaType) {
    return NextResponse.json({ error: "Choose a post or Reel from the connected account." }, { status: 400, headers: noStore });
  }
  if (parsed.value.targetProductId) {
    const { data: product, error } = await context.admin
      .from("storefront_products")
      .select("id")
      .eq("id", parsed.value.targetProductId)
      .eq("user_id", context.userId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle();
    if (error || !product) {
      if (error) console.error("Could not verify the product for Instagram automation update.", error);
      return NextResponse.json({ error: "Choose an active product from your storefront." }, { status: 400, headers: noStore });
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
    console.error("Could not verify the published storefront for Instagram automation update.", storefrontError);
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

  const { error } = await context.admin
    .from("instagram_automations")
    .update({
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
    .eq("id", id)
    .eq("creator_id", context.userId);
  if (error) {
    if (error.code === "P0001") {
      return NextResponse.json({ error: "An active automation already uses one of those keywords on this post." }, { status: 409, headers: noStore });
    }
    console.error("Could not update an Instagram automation.", error);
    return NextResponse.json({ error: "Instagram automation could not be updated." }, { status: 503, headers: noStore });
  }
  return NextResponse.json({ updated: true }, { headers: noStore });
}

export async function DELETE(_request: Request, routeContext: RouteContext) {
  if (!isSameOriginRequest(_request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers: noStore });
  const context = await getInstagramRequestContext();
  if (!context.ok) return context.response;
  const withinLimit = await checkInstagramRateLimit(context.admin, context.userId, "automation-write", 30);
  if (withinLimit === null) return NextResponse.json({ error: "Instagram services are temporarily unavailable." }, { status: 503, headers: noStore });
  if (!withinLimit) return NextResponse.json({ error: "Too many automation changes. Wait a minute and try again." }, { status: 429, headers: noStore });
  const { id } = await routeContext.params;
  const { data, error } = await context.admin
    .from("instagram_automations")
    .delete()
    .eq("id", id)
    .eq("creator_id", context.userId)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("Could not delete an Instagram automation.", error);
    return NextResponse.json({ error: "Instagram automation could not be deleted." }, { status: 503, headers: noStore });
  }
  if (!data) return NextResponse.json({ error: "Instagram automation not found." }, { status: 404, headers: noStore });
  return NextResponse.json({ deleted: true }, { headers: noStore });
}
