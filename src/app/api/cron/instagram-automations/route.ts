import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { checkInstagramRateLimit, markInstagramConnectionRequiresReauthorization } from "@/lib/instagram/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  decryptInstagramToken,
  encryptInstagramToken,
  getInstagramCommentDetails,
  InstagramApiError,
  isInstagramAuthorizationError,
  isInstagramCommentEligible,
  refreshInstagramAccessToken,
  selectMatchingInstagramAutomation,
  sendInstagramPrivateReply,
  type InstagramConnection,
  type InstagramCommentEvent,
} from "@/lib/instagram/server";

export const runtime = "nodejs";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function formatInstagramApiError(error: unknown): { code: string; message: string; retryable: boolean } {
  if (error instanceof InstagramApiError) {
    return {
      code: error.code ?? `http_${error.status}`,
      message: error.message.slice(0, 300),
      retryable: error.retryable,
    };
  }
  return {
    code: "internal_error",
    message: "Instagram automation processing failed.",
    retryable: false,
  };
}

async function updateEventFailure(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  event: InstagramCommentEvent,
  error: { code: string; message: string; retryable: boolean },
  now: number,
) {
  const retry = error.retryable && event.attempt_count < 8;
  const delaySeconds = Math.min(30 * 2 ** Math.max(0, event.attempt_count - 1), 6 * 60 * 60);
  const { error: updateError } = await admin
    .from("instagram_comment_events")
    .update({
      processing_status: retry ? "pending" : "failed",
      next_attempt_at: new Date(now + delaySeconds * 1000).toISOString(),
      processing_started_at: null,
      error_code: error.code,
      error_message: error.message,
      processed_at: retry ? null : new Date(now).toISOString(),
    })
    .eq("id", event.id)
    .eq("processing_status", "processing");
  if (updateError) {
    console.error("Could not record an Instagram private reply failure.", updateError);
    return false;
  }
  if (!retry && event.automation_id) {
    const { error: counterError } = await admin.rpc("increment_instagram_automation_counter", {
      requested_automation_id: event.automation_id,
      requested_counter: "failed",
    });
    if (counterError) console.error("Could not update Instagram automation failure analytics.", counterError);
  }
  return true;
}

async function refreshExpiringConnections(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
) {
  const threshold = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: connections, error } = await admin
    .from("instagram_connections")
    .select("*")
    .eq("connection_status", "connected")
    .lt("token_expires_at", threshold)
    .limit(25);
  if (error) {
    console.error("Could not find Instagram access tokens due for refresh.", error);
    return 0;
  }
  let refreshedCount = 0;
  for (const connection of (connections ?? []) as InstagramConnection[]) {
    if (!connection.access_token_encrypted) continue;
    try {
      const currentToken = decryptInstagramToken(connection.access_token_encrypted);
      const { accessToken, expiresIn } = await refreshInstagramAccessToken(currentToken);
      const { error: updateError } = await admin
        .from("instagram_connections")
        .update({
          access_token_encrypted: encryptInstagramToken(accessToken),
          token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
        })
        .eq("id", connection.id)
        .eq("connection_status", "connected");
      if (updateError) {
        console.error("Could not save a refreshed Instagram access token.", updateError);
      } else {
        refreshedCount += 1;
      }
    } catch (error) {
      console.error("An Instagram access token could not be refreshed.", {
        status: error instanceof InstagramApiError ? error.status : null,
        code: error instanceof InstagramApiError ? error.code : null,
      });
      if (isInstagramAuthorizationError(error)) {
        await markInstagramConnectionRequiresReauthorization(admin, connection.id);
      }
    }
  }
  return refreshedCount;
}

async function getReplyLink(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  creatorId: string,
  productId: string | null,
): Promise<string | null> {
  const { data: storefront, error } = await admin
    .from("creator_storefronts")
    .select("username")
    .eq("user_id", creatorId)
    .eq("status", "published")
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !storefront?.username) {
    if (error) console.error("Could not validate a published storefront for an Instagram reply.", error);
    return null;
  }
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (!origin) return null;
  if (!productId) return `${origin}/${storefront.username}#products`;
  const { data: product, error: productError } = await admin
    .from("storefront_products")
    .select("id")
    .eq("id", productId)
    .eq("user_id", creatorId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (productError) {
    console.error("Could not validate a product for an Instagram reply.", productError);
    return null;
  }
  return product ? `${origin}/${storefront.username}#product-${product.id}` : null;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Instagram automation processing is unavailable." }, { status: 503 });
  }

  const tokensRefreshed = await refreshExpiringConnections(admin);
  const staleCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: staleEvents, error: staleError } = await admin
    .from("instagram_comment_events")
    .update({
      processing_status: "failed",
      processing_started_at: null,
      error_code: "delivery_status_unknown",
      error_message: "Processing stopped before delivery could be confirmed. This event was not retried to prevent a duplicate private reply.",
      processed_at: new Date().toISOString(),
    })
    .eq("processing_status", "processing")
    .lt("processing_started_at", staleCutoff)
    .select("automation_id");
  if (staleError) console.error("Could not close stale Instagram processing events.", staleError);
  for (const staleEvent of staleEvents ?? []) {
    if (!staleEvent.automation_id) continue;
    const { error } = await admin.rpc("increment_instagram_automation_counter", {
      requested_automation_id: staleEvent.automation_id,
      requested_counter: "failed",
    });
    if (error) console.error("Could not update analytics for a stale Instagram event.", error);
  }

  const { data: queued, error: queueError } = await admin
    .from("instagram_comment_events")
    .select("*")
    .eq("processing_status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(20);
  if (queueError) {
    console.error("Could not load queued Instagram comment events.", queueError);
    return NextResponse.json({ error: "Instagram automation processing failed." }, { status: 503 });
  }
  let processed = 0;
  let sent = 0;
  for (const candidate of (queued ?? []) as InstagramCommentEvent[]) {
    const { data: event, error: claimError } = await admin
      .from("instagram_comment_events")
      .update({
        processing_status: "processing",
        attempt_count: candidate.attempt_count + 1,
        processing_started_at: new Date().toISOString(),
      })
      .eq("id", candidate.id)
      .eq("processing_status", "pending")
      .lte("next_attempt_at", new Date().toISOString())
      .select("*")
      .maybeSingle();
    if (claimError) {
      console.error("Could not claim an Instagram comment event.", claimError);
      continue;
    }
    if (!event) continue;
    processed += 1;
    const claimedEvent = event as InstagramCommentEvent;
    const { data: connection, error: connectionError } = await admin
      .from("instagram_connections")
      .select("*")
      .eq("id", claimedEvent.instagram_connection_id)
      .eq("connection_status", "connected")
      .maybeSingle();
    if (connectionError) {
      await updateEventFailure(admin, claimedEvent, {
        code: "connection_lookup_failed",
        message: "The Instagram account could not be checked.",
        retryable: true,
      }, Date.now());
      continue;
    }
    if (!connection?.access_token_encrypted) {
      await updateEventFailure(admin, claimedEvent, {
        code: "connection_unavailable",
        message: "Reconnect the Instagram account to send this reply.",
        retryable: false,
      }, Date.now());
      continue;
    }
    let commentDetails: Awaited<ReturnType<typeof getInstagramCommentDetails>>;
    try {
      commentDetails = await getInstagramCommentDetails(
        claimedEvent.instagram_comment_id,
        decryptInstagramToken(connection.access_token_encrypted),
      );
    } catch (error) {
      if (isInstagramAuthorizationError(error)) {
        await markInstagramConnectionRequiresReauthorization(admin, connection.id);
      }
      await updateEventFailure(admin, claimedEvent, formatInstagramApiError(error), Date.now());
      continue;
    }
    const { error: commentUpdateError } = await admin
      .from("instagram_comment_events")
      .update({
        comment_timestamp: commentDetails.timestamp,
        comment_text: commentDetails.text ?? claimedEvent.comment_text,
        commenter_id: commentDetails.commenterId ?? claimedEvent.commenter_id,
      })
      .eq("id", claimedEvent.id)
      .eq("processing_status", "processing");
    if (commentUpdateError) {
      console.error("Could not save verified Instagram comment details.", commentUpdateError);
      await updateEventFailure(admin, claimedEvent, {
        code: "comment_details_save_failed",
        message: "The verified Instagram comment details could not be saved.",
        retryable: true,
      }, Date.now());
      continue;
    }
    if (!isInstagramCommentEligible(commentDetails.timestamp)) {
      await admin
        .from("instagram_comment_events")
        .update({
          processing_status: "failed",
          processing_started_at: null,
          error_code: "comment_expired",
          error_message: "Instagram's seven-day private reply window has expired.",
          processed_at: new Date().toISOString(),
        })
        .eq("id", claimedEvent.id)
        .eq("processing_status", "processing");
      continue;
    }

    const { data: automations, error: automationError } = await admin
      .from("instagram_automations")
      .select("id,creator_id,trigger_keywords,match_type,reply_message,target_product_id,status,created_at")
      .eq("instagram_connection_id", connection.id)
      .eq("media_id", claimedEvent.instagram_media_id)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (automationError) {
      await updateEventFailure(admin, claimedEvent, {
        code: "automation_lookup_failed",
        message: "The Instagram automation could not be checked.",
        retryable: true,
      }, Date.now());
      continue;
    }
    const comment = commentDetails.text ?? claimedEvent.comment_text ?? "";
    const match = selectMatchingInstagramAutomation(comment, automations ?? []);
    if (!match) {
      await admin
        .from("instagram_comment_events")
        .update({
          processing_status: "ignored",
          processing_started_at: null,
          error_code: "no_matching_automation",
          error_message: "No active automation matched this comment.",
          processed_at: new Date().toISOString(),
        })
        .eq("id", claimedEvent.id)
        .eq("processing_status", "processing");
      continue;
    }

    const matching = match.automation;
    const matchedKeyword = match.keyword;
    const { data: matchRecorded, error: matchError } = await admin.rpc("record_instagram_automation_match", {
      requested_event_id: claimedEvent.id,
      requested_automation_id: matching.id,
      requested_keyword: matchedKeyword,
    });
    if (matchError) {
      console.error("Could not record a matched Instagram comment.", matchError);
      await updateEventFailure(admin, claimedEvent, {
        code: "match_record_failed",
        message: "The matched Instagram comment could not be recorded.",
        retryable: true,
      }, Date.now());
      continue;
    }
    if (!matchRecorded) {
      await admin
        .from("instagram_comment_events")
        .update({
          processing_status: "ignored",
          processing_started_at: null,
          error_code: "automation_no_longer_active",
          error_message: "The matching automation is no longer active.",
          processed_at: new Date().toISOString(),
        })
        .eq("id", claimedEvent.id)
        .eq("processing_status", "processing");
      continue;
    }

    const link = await getReplyLink(admin, matching.creator_id, matching.target_product_id);
    if (!link) {
      await updateEventFailure(admin, { ...claimedEvent, automation_id: matching.id }, {
        code: "storefront_unavailable",
        message: "The selected published storefront or product link is no longer available.",
        retryable: false,
      }, Date.now());
      continue;
    }
    const reply = `${matching.reply_message.trim()}\n${link}`;
    const withinSendLimit = await checkInstagramRateLimit(
      admin,
      connection.creator_id,
      `private-reply-${connection.id}`,
      20,
    );
    if (!withinSendLimit) {
      if (withinSendLimit === null) {
        console.error("Could not check the Instagram private reply rate limit.");
      }
      const { error: deferError } = await admin
        .from("instagram_comment_events")
        .update({
          processing_status: "pending",
          attempt_count: candidate.attempt_count,
          processing_started_at: null,
          next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
        })
        .eq("id", claimedEvent.id)
        .eq("processing_status", "processing");
      if (deferError) console.error("Could not defer an Instagram reply due to rate limiting.", deferError);
      continue;
    }
    try {
      const messageId = await sendInstagramPrivateReply(
        connection.instagram_user_id,
        claimedEvent.instagram_comment_id,
        decryptInstagramToken(connection.access_token_encrypted),
        reply,
      );
      const { error: sentError } = await admin
        .from("instagram_comment_events")
        .update({
          processing_status: "sent",
          processing_started_at: null,
          message_id: messageId,
          error_code: null,
          error_message: null,
          processed_at: new Date().toISOString(),
        })
        .eq("id", claimedEvent.id)
        .eq("processing_status", "processing");
      if (sentError) {
        console.error("Instagram confirmed a private reply, but its result could not be stored.", sentError);
        continue;
      }
      const { error: counterError } = await admin.rpc("increment_instagram_automation_counter", {
        requested_automation_id: matching.id,
        requested_counter: "sent",
      });
      if (counterError) console.error("Could not update Instagram sent-message analytics.", counterError);
      sent += 1;
    } catch (error) {
      await updateEventFailure(admin, { ...claimedEvent, automation_id: matching.id }, formatInstagramApiError(error), Date.now());
    }
  }

  const retentionCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { error: retentionError } = await admin
    .from("instagram_comment_events")
    .update({ commenter_id: null, comment_text: null })
    .lt("created_at", retentionCutoff)
    .or("commenter_id.not.is.null,comment_text.not.is.null");
  if (retentionError) console.error("Could not remove retained Instagram commenter details.", retentionError);

  return NextResponse.json({ tokensRefreshed, processed, sent }, { headers: { "Cache-Control": "no-store" } });
}
