import { after } from "next/server";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getFreeProductDeliveryConfig,
  getRazorpayCheckoutConnection,
  getRazorpayApplicationWebhookSecrets,
  getRazorpayTestWebhookSecret,
  isRazorpayPartnerWebhookFulfillmentEnabled,
  razorpayApiRequest,
  verifyRazorpayWebhookSignature,
} from "@/lib/razorpay/checkout";
import {
  getRazorpayApplicationConfig,
  getRazorpayOAuthMode,
  isRazorpayConnectionUsable,
  type RazorpayOAuthEnvironment,
} from "@/lib/razorpay/oauth";
import { processRazorpayPartnerWebhookQueue } from "@/lib/razorpay/webhook-fulfillment";
import { processRazorpayPurchaseEmailQueue } from "@/lib/razorpay/purchase-email";

type ProviderOrder = {
  id: string;
  amount: number;
  currency: string;
  receipt?: string;
};

type ProviderPayment = {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  captured: boolean;
  account_id?: string;
};

type ProviderPayments = { items?: ProviderPayment[] };

type InternalOrder = {
  id: string;
  creator_id: string;
  amount_paise: number;
  currency: string;
  razorpay_order_id: string;
  application_key: string;
  razorpay_account_id: string;
};

function response(status: number) {
  return new NextResponse(null, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function deliverPurchaseEmailForEvent(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  eventId: string,
) {
  const { data: event, error: eventError } = await admin
    .from("razorpay_checkout_events")
    .select("razorpay_order_id,environment")
    .eq("event_id", eventId)
    .maybeSingle();
  if (eventError) {
    console.error("Razorpay event order could not be loaded for purchase email delivery.", {
      code: eventError.code,
    });
    return;
  }
  if (
    !event ||
    typeof event.razorpay_order_id !== "string" ||
    (event.environment !== "test" && event.environment !== "live")
  ) return;

  const { data: order, error: orderError } = await admin
    .from("razorpay_checkout_orders")
    .select("id")
    .eq("razorpay_order_id", event.razorpay_order_id)
    .eq("environment", event.environment)
    .maybeSingle();
  if (orderError) {
    console.error("Razorpay order could not be loaded for purchase email delivery.", {
      code: orderError.code,
    });
    return;
  }
  if (!order || typeof order.id !== "string") return;
  await processRazorpayPurchaseEmailQueue(admin, order.id, 1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function diagnosticIdentifier(value: unknown, prefix: "acc" | "pay" | "order"): string | null {
  return typeof value === "string" &&
    new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(value)
    ? value
    : null;
}

function applicationWebhookIdentifiers(rawBody: string): {
  eventType: string | null;
  accountId: string | null;
  paymentId: string | null;
  orderId: string | null;
} {
  let event: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (isRecord(parsed)) event = parsed;
  } catch {}

  const payload = event && isRecord(event.payload) ? event.payload : {};
  const paymentEntity =
    isRecord(payload.payment) && isRecord(payload.payment.entity)
      ? payload.payment.entity
      : {};
  const eventType =
    typeof event?.event === "string" &&
    /^[a-z][a-z0-9._]{0,99}$/.test(event.event)
      ? event.event
      : null;
  const fields = {
    eventType,
    accountId: diagnosticIdentifier(event?.account_id, "acc"),
    paymentId: diagnosticIdentifier(paymentEntity.id, "pay"),
    orderId: diagnosticIdentifier(paymentEntity.order_id, "order"),
  };
  return fields;
}

async function enqueuePartnerPaymentEvent(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  eventId: string,
  eventType: string,
  accountId: string,
  paymentId: string,
  orderId: string,
  environment: RazorpayOAuthEnvironment,
  applicationKey: "ZERO_FEE" | "FOUR_PERCENT",
): Promise<number> {
  const config = getRazorpayApplicationConfig(applicationKey, environment);
  if (!config) return 503;

  const { data: connection, error: connectionError } = await admin
    .from("creator_razorpay_connections")
    .select("creator_id,application_key,client_id,connection_status,token_expires_at,public_token")
    .eq("razorpay_account_id", accountId)
    .eq("environment", environment)
    .eq("connection_status", "connected")
    .maybeSingle();

  if (connectionError) {
    console.error("Razorpay partner webhook account mapping could not be checked.", {
      code: connectionError.code,
    });
    return 503;
  }
  let creatorId = connection?.application_key === applicationKey &&
      connection.client_id === config.clientId &&
      typeof connection.creator_id === "string"
    ? connection.creator_id
    : null;
  const activeConnection = Boolean(creatorId);
  if (!creatorId) {
    const { data: historicalConnection, error: historyError } = await admin
      .from("razorpay_connection_history")
      .select("creator_id,application_id")
      .eq("razorpay_account_id", accountId)
      .eq("environment", environment)
      .eq("application_key", applicationKey)
      .eq("connection_status", "connected")
      .order("archived_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (historyError) {
      console.error("Razorpay historical webhook account mapping could not be checked.", {
        code: historyError.code,
      });
      return 503;
    }
    if (historicalConnection?.application_id === config.clientId) {
      creatorId = typeof historicalConnection.creator_id === "string"
        ? historicalConnection.creator_id
        : null;
    }
  }
  if (!creatorId) {
    console.warn("Razorpay partner webhook account has no creator/application mapping.");
    return 400;
  }
  if (
    connection &&
    activeConnection &&
    (
      !isRazorpayConnectionUsable(
        connection.connection_status,
        typeof connection.token_expires_at === "string"
          ? connection.token_expires_at
          : null,
      ) ||
      typeof connection.public_token !== "string" ||
      !connection.public_token.startsWith(
        environment === "test" ? "rzp_test_" : "rzp_live_",
      )
    )
  ) {
    return 503;
  }

  const eventRow = {
    event_id: eventId,
    event_type: eventType,
    razorpay_account_id: accountId,
    environment,
    application_key: applicationKey,
    creator_id: creatorId,
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    processing_status: "received",
  };
  const { error: insertError } = await admin
    .from("razorpay_checkout_events")
    .insert(eventRow);

  let shouldSchedule = !insertError;
  if (insertError) {
    if (insertError.code !== "23505") {
      console.error("Razorpay partner webhook event could not be recorded.", {
        code: insertError.code,
      });
      return 503;
    }

    const { data: existingEvent, error: existingError } = await admin
      .from("razorpay_checkout_events")
      .select(
        "event_type,razorpay_account_id,environment,application_key,creator_id,razorpay_order_id,razorpay_payment_id,processing_status",
      )
      .eq("event_id", eventId)
      .maybeSingle();
    if (existingError || !existingEvent) {
      console.error("Razorpay partner webhook duplicate could not be checked.", {
        code: existingError?.code ?? "not_found",
      });
      return 503;
    }

    const legacyEvent =
      existingEvent.event_type === eventType &&
      existingEvent.razorpay_account_id === accountId &&
      existingEvent.environment === environment &&
      existingEvent.application_key === null &&
      existingEvent.creator_id === null &&
      existingEvent.razorpay_order_id === null &&
      existingEvent.razorpay_payment_id === null &&
      ["processed", "ignored", "failed"].includes(
        existingEvent.processing_status,
      );
    if (legacyEvent) {
      const { error: upgradeError } = await admin
        .from("razorpay_checkout_events")
        .update({
          creator_id: creatorId,
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          application_key: applicationKey,
          processing_status: "received",
          processed_at: null,
          next_attempt_at: new Date().toISOString(),
          locked_until: null,
          last_error_code: null,
        })
        .eq("event_id", eventId)
        .eq("event_type", eventType)
        .eq("razorpay_account_id", accountId)
        .eq("environment", environment)
        .is("application_key", null)
        .is("creator_id", null)
        .is("razorpay_order_id", null)
        .is("razorpay_payment_id", null)
        .in("processing_status", ["processed", "ignored", "failed"]);
      if (upgradeError) {
        console.error("Razorpay partner webhook legacy event could not be queued.", {
          code: upgradeError.code,
        });
        return 503;
      }

      const { data: upgradedEvent, error: upgradedEventError } = await admin
        .from("razorpay_checkout_events")
        .select(
          "event_type,razorpay_account_id,environment,application_key,creator_id,razorpay_order_id,razorpay_payment_id,processing_status",
        )
        .eq("event_id", eventId)
        .maybeSingle();
      if (upgradedEventError || !upgradedEvent) {
        console.error("Razorpay partner webhook legacy event could not be verified.", {
          code: upgradedEventError?.code ?? "not_found",
        });
        return 503;
      }
      Object.assign(existingEvent, upgradedEvent);
    }

    const sameEvent =
      existingEvent.event_type === eventType &&
      existingEvent.razorpay_account_id === accountId &&
      existingEvent.environment === environment &&
      existingEvent.application_key === applicationKey &&
      existingEvent.creator_id === creatorId &&
      existingEvent.razorpay_order_id === orderId &&
      existingEvent.razorpay_payment_id === paymentId;
    if (!sameEvent) {
      console.warn("Razorpay partner webhook event identifier conflicted with stored event data.");
      return 409;
    }
    if (
      existingEvent.processing_status === "processed" ||
      existingEvent.processing_status === "ignored"
    ) {
      return 200;
    }
    shouldSchedule = true;
  }

  console.info("Razorpay partner payment event queued.", {
    environment,
    eventType,
    accountId,
    paymentId,
    orderId,
    signatureVerified: true,
  });
  if (shouldSchedule) {
    try {
      after(async () => {
        const result = await processRazorpayPartnerWebhookQueue(admin, eventId, 1);
        if (result.processed > 0) {
          await deliverPurchaseEmailForEvent(admin, eventId);
        }
      });
    } catch {
      console.error("Razorpay partner webhook background processing could not be scheduled.");
      return 503;
    }
  }
  return 200;
}

async function processPartnerApplicationEvent(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  eventId: string,
  eventType: string,
  accountId: string,
  applicationKey: "ZERO_FEE" | "FOUR_PERCENT",
  environment: RazorpayOAuthEnvironment,
  event: Record<string, unknown>,
): Promise<number> {
  const config = getRazorpayApplicationConfig(applicationKey, environment);
  if (!config) return 503;

  const { data: connection, error: connectionError } = await admin
    .from("creator_razorpay_connections")
    .select("creator_id,client_id,application_key,connection_status")
    .eq("razorpay_account_id", accountId)
    .eq("environment", environment)
    .eq("application_key", applicationKey)
    .maybeSingle();
  if (connectionError) {
    console.error("Razorpay application event account mapping could not be checked.", {
      code: connectionError.code,
    });
    return 503;
  }
  let creatorId = connection?.client_id === config.clientId &&
      connection.application_key === applicationKey &&
      typeof connection.creator_id === "string"
    ? connection.creator_id
    : null;
  if (!creatorId) {
    const { data: historicalConnection, error: historyError } = await admin
      .from("razorpay_connection_history")
      .select("creator_id,application_id")
      .eq("razorpay_account_id", accountId)
      .eq("environment", environment)
      .eq("application_key", applicationKey)
      .eq("connection_status", "connected")
      .order("archived_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (historyError) {
      console.error("Razorpay historical application event mapping could not be checked.", {
        code: historyError.code,
      });
      return 503;
    }
    if (historicalConnection?.application_id === config.clientId) {
      creatorId = typeof historicalConnection.creator_id === "string"
        ? historicalConnection.creator_id
        : null;
    }
  }
  if (!creatorId) return 400;

  const payload = isRecord(event.payload) ? event.payload : {};
  const paymentEntity = isRecord(payload.payment) && isRecord(payload.payment.entity)
    ? payload.payment.entity
    : null;
  const refundEntity = isRecord(payload.refund) && isRecord(payload.refund.entity)
    ? payload.refund.entity
    : null;
  const paymentId = diagnosticIdentifier(paymentEntity?.id ?? refundEntity?.payment_id, "pay");
  const orderId = diagnosticIdentifier(paymentEntity?.order_id, "order");

  const { error: insertError } = await admin.from("razorpay_checkout_events").insert({
    event_id: eventId,
    event_type: eventType,
    razorpay_account_id: accountId,
    environment,
    application_key: applicationKey,
    creator_id: creatorId,
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    processing_status: "received",
  });
  if (insertError) {
    if (insertError.code !== "23505") {
      console.error("Razorpay application event could not be recorded.", {
        code: insertError.code,
      });
      return 503;
    }
    const { data: existingEvent, error: duplicateError } = await admin
      .from("razorpay_checkout_events")
      .select("event_type,razorpay_account_id,environment,application_key,processing_status")
      .eq("event_id", eventId)
      .maybeSingle();
    if (duplicateError || !existingEvent) return 503;
    if (
      existingEvent.event_type !== eventType ||
      existingEvent.razorpay_account_id !== accountId ||
      existingEvent.environment !== environment ||
      existingEvent.application_key !== applicationKey
    ) return 409;
    if (["processed", "ignored"].includes(existingEvent.processing_status)) return 200;
  }

  if (eventType === "account.app.authorization_revoked") {
    const { error: revokeError } = await admin
      .from("creator_razorpay_connections")
      .update({
        connection_status: "revoked",
        public_token: null,
        access_token_encrypted: null,
        refresh_token_encrypted: null,
        token_expires_at: null,
        refresh_token_expires_at: null,
        disconnected_at: new Date().toISOString(),
        last_error_code: "authorization_revoked",
        refresh_lock_token: null,
        refresh_lock_expires_at: null,
      })
      .eq("creator_id", creatorId)
      .eq("environment", environment)
      .eq("application_key", applicationKey)
      .in("connection_status", ["connected", "reconnect_required"]);
    if (revokeError) {
      console.error("Razorpay revoked authorisation could not be recorded.", {
        code: revokeError.code,
      });
      await setEventStatus(admin, eventId, "failed");
      return 503;
    }
    const { error: historyRevokeError } = await admin
      .from("razorpay_connection_history")
      .update({
        connection_status: "revoked",
        public_token: null,
        access_token_encrypted: null,
        refresh_token_encrypted: null,
        token_expires_at: null,
        refresh_token_expires_at: null,
      })
      .eq("creator_id", creatorId)
      .eq("razorpay_account_id", accountId)
      .eq("environment", environment)
      .eq("application_key", applicationKey)
      .eq("connection_status", "connected");
    if (historyRevokeError) {
      console.error("Razorpay historical revocation status could not be saved.", {
        code: historyRevokeError.code,
      });
    }
    const { error: auditError } = await admin.from("razorpay_connection_audit").insert({
      creator_id: creatorId,
      action: "authorization_revoked",
      environment,
      application_key: applicationKey,
    });
    if (auditError) console.error("Razorpay revocation audit could not be saved.", { code: auditError.code });
    return (await setEventStatus(admin, eventId, "processed")) ? 200 : 503;
  }

  if (eventType === "refund.processed" || eventType === "refund.failed") {
    if (!paymentId || !refundEntity || typeof refundEntity.amount !== "number") {
      await setEventStatus(admin, eventId, "failed");
      return 400;
    }
    const { data: updated, error: refundError } = await admin
      .from("razorpay_payment_attempts")
      .update({
        refund_status: eventType === "refund.processed" ? "processed" : "failed",
        refund_amount_paise: refundEntity.amount,
      })
      .eq("razorpay_payment_id", paymentId)
      .eq("environment", environment)
      .eq("application_key", applicationKey)
      .eq("razorpay_account_id", accountId)
      .select("razorpay_payment_id")
      .maybeSingle();
    if (refundError || !updated) {
      if (refundError) {
        console.error("Razorpay refund event could not be recorded.", {
          code: refundError.code,
        });
      }
      await setEventStatus(admin, eventId, "failed");
      return 503;
    }
    return (await setEventStatus(admin, eventId, "processed")) ? 200 : 503;
  }

  if (
    (eventType !== "payment.authorized" && eventType !== "payment.failed") ||
    !paymentId ||
    !orderId
  ) {
    return (await setEventStatus(admin, eventId, "ignored")) ? 200 : 503;
  }

  const { data: orderData, error: orderError } = await admin
    .from("razorpay_checkout_orders")
    .select("id,creator_id,amount_paise,currency,razorpay_order_id,application_key,razorpay_account_id")
    .eq("razorpay_order_id", orderId)
    .eq("environment", environment)
    .eq("application_key", applicationKey)
    .eq("razorpay_account_id", accountId)
    .maybeSingle();
  if (orderError || !orderData) {
    if (orderError) console.error("Razorpay application event order could not be loaded.", { code: orderError.code });
    await setEventStatus(admin, eventId, "failed");
    return orderError ? 503 : 200;
  }
  const order = orderData as InternalOrder;
  const checkoutConnection = await getRazorpayCheckoutConnection(
    order.creator_id,
    environment,
    applicationKey,
  );
  if (
    !checkoutConnection ||
    checkoutConnection.applicationKey !== applicationKey ||
    checkoutConnection.accountId !== accountId
  ) {
    await setEventStatus(admin, eventId, "failed");
    return 503;
  }

  try {
    const payment = await razorpayApiRequest<ProviderPayment>(
      checkoutConnection.accessToken,
      `/v1/payments/${encodeURIComponent(paymentId)}`,
    );
    if (
      payment.id !== paymentId ||
      payment.order_id !== orderId ||
      payment.amount !== order.amount_paise ||
      payment.currency !== order.currency ||
      (payment.account_id && payment.account_id !== accountId)
    ) {
      return (await setEventStatus(admin, eventId, "ignored")) ? 200 : 503;
    }
    const status = payment.status === "captured" && payment.captured
      ? "captured"
      : payment.status === "failed"
        ? "failed"
        : payment.status === "authorized"
          ? "authorized"
          : null;
    if (!status) return (await setEventStatus(admin, eventId, "ignored")) ? 200 : 503;
    const deliveryConfig = getFreeProductDeliveryConfig();
    if (!deliveryConfig) {
      await setEventStatus(admin, eventId, "failed");
      return 503;
    }
    const { error: recordError } = await admin.rpc("record_razorpay_checkout_payment", {
      p_order_id: order.id,
      p_environment: environment,
      p_payment_id: payment.id,
      p_amount_paise: payment.amount,
      p_currency: payment.currency,
      p_payment_status: status,
      p_captured: status === "captured",
      p_max_downloads: deliveryConfig.maxDownloads,
      p_expiry_hours: deliveryConfig.expiryHours,
    });
    if (recordError) {
      console.error("Razorpay application payment status could not be persisted.", {
        code: recordError.code,
      });
      await setEventStatus(admin, eventId, "failed");
      return 503;
    }
    if (status === "captured") await processRazorpayPurchaseEmailQueue(admin, order.id, 1);
    return (await setEventStatus(admin, eventId, "processed")) ? 200 : 503;
  } catch {
    await setEventStatus(admin, eventId, "failed");
    return 503;
  }
}

async function setEventStatus(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  eventId: string,
  processingStatus: "processed" | "ignored" | "failed",
) {
  const { error } = await admin
    .from("razorpay_checkout_events")
    .update({
      processing_status: processingStatus,
      processed_at: new Date().toISOString(),
    })
    .eq("event_id", eventId);
  if (error) console.error("Razorpay webhook event status could not be saved.");
  return !error;
}

export async function POST(request: Request) {
  const environment = getRazorpayOAuthMode();
  if (!environment) return response(503);
  const admin = createSupabaseAdminClient();
  const accountWebhookSecret =
    environment === "test" ? getRazorpayTestWebhookSecret() : null;
  const partnerWebhookSecrets = getRazorpayApplicationWebhookSecrets(environment);
  const partnerFulfillmentEnabled =
    isRazorpayPartnerWebhookFulfillmentEnabled(environment);
  if (!admin || (!accountWebhookSecret && !partnerFulfillmentEnabled)) {
    return response(503);
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");
  const accountSignatureValid = accountWebhookSecret
    ? verifyRazorpayWebhookSignature(rawBody, signature, accountWebhookSecret)
    : false;
  const matchingPartnerSecrets = partnerFulfillmentEnabled
    ? partnerWebhookSecrets.filter(({ secret }) =>
        verifyRazorpayWebhookSignature(rawBody, signature, secret),
      )
    : [];

  if (matchingPartnerSecrets.length > 1 || (accountSignatureValid && matchingPartnerSecrets.length > 0)) {
    console.error("Razorpay webhook signature matched multiple integrations.");
    return response(400);
  }
  if (matchingPartnerSecrets.length === 1) {
    const applicationKey = matchingPartnerSecrets[0].applicationKey;
    let event: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(rawBody);
      if (!isRecord(parsed)) return response(400);
      event = parsed;
    } catch {
      return response(400);
    }

    const eventType = event.event;
    if (typeof eventType !== "string") return response(400);
    const payload = isRecord(event.payload) ? event.payload : {};
    const paymentEntity =
      isRecord(payload.payment) && isRecord(payload.payment.entity)
        ? payload.payment.entity
        : null;
    const accountId = diagnosticIdentifier(event.account_id, "acc");
    const refundEntity =
      isRecord(payload.refund) && isRecord(payload.refund.entity)
        ? payload.refund.entity
        : null;
    const paymentId = diagnosticIdentifier(
      paymentEntity?.id ?? refundEntity?.payment_id,
      "pay",
    );
    const orderId = diagnosticIdentifier(paymentEntity?.order_id, "order");
    const embeddedAccountId = paymentEntity?.account_id;
    const eventId = request.headers.get("x-razorpay-event-id");
    if (
      !accountId ||
      (typeof embeddedAccountId === "string" && embeddedAccountId !== accountId) ||
      (embeddedAccountId !== undefined && typeof embeddedAccountId !== "string") ||
      !eventId ||
      eventId.length > 200
    ) {
      return response(400);
    }

    if (eventType !== "payment.captured") {
      return processPartnerApplicationEvent(
        admin,
        eventId,
        eventType,
        accountId,
        applicationKey,
        environment,
        event,
      ).then(response);
    }
    if (!paymentId || !orderId) return response(400);

    const status = await enqueuePartnerPaymentEvent(
      admin,
      eventId,
      eventType,
      accountId,
      paymentId,
      orderId,
      environment,
      applicationKey,
    );
    return response(status);
  }
  if (!accountSignatureValid) {
    const fields = applicationWebhookIdentifiers(rawBody);
    console.warn("Razorpay webhook signature verification failed.", {
      ...fields,
      signatureVerified: false,
    });
    return response(400);
  }
  const secret = accountWebhookSecret;
  if (!secret) return response(503);

  const eventId = request.headers.get("x-razorpay-event-id");
  if (!eventId || eventId.length > 200) return response(400);

  let event: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (!isRecord(parsed)) return response(400);
    event = parsed;
  } catch {
    return response(400);
  }

  const eventType = event.event;
  const payload = isRecord(event.payload) ? event.payload : {};
  const paymentEntity = isRecord(payload.payment) && isRecord(payload.payment.entity)
    ? payload.payment.entity
    : null;
  const orderEntity = isRecord(payload.order) && isRecord(payload.order.entity)
    ? payload.order.entity
    : null;
  const accountId =
    (typeof event.account_id === "string" && event.account_id) ||
    (paymentEntity && typeof paymentEntity.account_id === "string"
      ? paymentEntity.account_id
      : orderEntity && typeof orderEntity.account_id === "string"
        ? orderEntity.account_id
      : null);

  const { error: insertEventError } = await admin
    .from("razorpay_checkout_events")
    .insert({
      event_id: eventId,
      event_type: typeof eventType === "string" ? eventType : "unknown",
      razorpay_account_id: accountId,
      environment: "test",
      processing_status: "received",
    });

  if (insertEventError) {
    const { data: existingEvent } = await admin
      .from("razorpay_checkout_events")
      .select("processing_status")
      .eq("event_id", eventId)
      .maybeSingle();
    if (
      existingEvent?.processing_status === "processed" ||
      existingEvent?.processing_status === "ignored"
    ) {
      return response(200);
    }
    if (!existingEvent) {
      console.error("Razorpay webhook event could not be recorded.");
      return response(500);
    }
  }

  if (
    !accountId ||
    !["payment.authorized", "payment.failed", "payment.captured", "order.paid"].includes(
      typeof eventType === "string" ? eventType : "",
    )
  ) {
    return (await setEventStatus(admin, eventId, "ignored")) ? response(200) : response(500);
  }

  const providerOrderId =
    (paymentEntity && typeof paymentEntity.order_id === "string"
      ? paymentEntity.order_id
      : null) ||
    (orderEntity && typeof orderEntity.id === "string" ? orderEntity.id : null);
  if (!providerOrderId) {
    return (await setEventStatus(admin, eventId, "ignored")) ? response(200) : response(500);
  }

  const { data: orderData, error: orderLookupError } = await admin
    .from("razorpay_checkout_orders")
    .select("id,creator_id,amount_paise,currency,razorpay_order_id")
    .eq("razorpay_order_id", providerOrderId)
    .eq("environment", "test")
    .maybeSingle();

  if (orderLookupError) {
    console.error("Razorpay webhook order could not be loaded.");
    await setEventStatus(admin, eventId, "failed");
    return response(503);
  }
  if (!orderData) {
    return (await setEventStatus(admin, eventId, "ignored")) ? response(200) : response(500);
  }
  const order = orderData as InternalOrder;
  const connection = await getRazorpayCheckoutConnection(order.creator_id);
  if (!connection || connection.accountId !== accountId) {
    return (await setEventStatus(admin, eventId, "ignored")) ? response(200) : response(500);
  }

  const { data: registration, error: registrationError } = await admin
    .from("razorpay_checkout_webhooks")
    .select("razorpay_webhook_id")
    .eq("creator_id", order.creator_id)
    .eq("razorpay_account_id", accountId)
    .eq("environment", "test")
    .maybeSingle();
  if (registrationError) {
    console.error("Razorpay webhook registration could not be checked.");
    await setEventStatus(admin, eventId, "failed");
    return response(503);
  }
  if (!registration) {
    return (await setEventStatus(admin, eventId, "ignored")) ? response(200) : response(500);
  }

  try {
    const providerOrder = await razorpayApiRequest<ProviderOrder>(
      connection.accessToken,
      `/v1/orders/${encodeURIComponent(providerOrderId)}`,
    );
    if (
      providerOrder.id !== providerOrderId ||
      providerOrder.amount !== order.amount_paise ||
      providerOrder.currency !== order.currency ||
      providerOrder.receipt !== order.id
    ) {
      return (await setEventStatus(admin, eventId, "ignored")) ? response(200) : response(500);
    }

    let paymentId =
      paymentEntity && typeof paymentEntity.id === "string"
        ? paymentEntity.id
        : null;
    if (!paymentId) {
      const payments = await razorpayApiRequest<ProviderPayments>(
        connection.accessToken,
        `/v1/orders/${encodeURIComponent(providerOrderId)}/payments`,
      );
      paymentId =
        payments.items?.find(
          (item) => item.status === "captured" && item.captured,
        )?.id ?? null;
    }

    if (!paymentId) {
      return (await setEventStatus(admin, eventId, "processed")) ? response(200) : response(500);
    }

    const payment = await razorpayApiRequest<ProviderPayment>(
      connection.accessToken,
      `/v1/payments/${encodeURIComponent(paymentId)}`,
    );
    if (
      payment.id !== paymentId ||
      payment.order_id !== providerOrderId ||
      payment.amount !== order.amount_paise ||
      payment.currency !== order.currency ||
      (payment.account_id && payment.account_id !== accountId)
    ) {
      return (await setEventStatus(admin, eventId, "ignored")) ? response(200) : response(500);
    }

    const isCaptured = payment.status === "captured" && payment.captured === true;
    const paymentStatus =
      isCaptured
        ? "captured"
        : payment.status === "failed"
          ? "failed"
          : payment.status === "authorized"
            ? "authorized"
            : null;

    if (!paymentStatus) {
      return (await setEventStatus(admin, eventId, "processed")) ? response(200) : response(500);
    }

    const deliveryConfig = getFreeProductDeliveryConfig();
    if (!deliveryConfig) {
      console.error("Paid product delivery limits are invalid.");
      await setEventStatus(admin, eventId, "failed");
      return response(503);
    }

    const { error: recordError } = await admin.rpc(
      "record_razorpay_checkout_payment",
      {
        p_order_id: order.id,
        p_environment: "test",
        p_payment_id: payment.id,
        p_amount_paise: payment.amount,
        p_currency: payment.currency,
        p_payment_status: paymentStatus,
        p_captured: isCaptured,
        p_max_downloads: deliveryConfig.maxDownloads,
        p_expiry_hours: deliveryConfig.expiryHours,
      },
    );

    if (recordError) {
      console.error("Razorpay payment could not be recorded.");
      await setEventStatus(admin, eventId, "failed");
      return response(503);
    }

    return (await setEventStatus(admin, eventId, "processed")) ? response(200) : response(500);
  } catch {
    await setEventStatus(admin, eventId, "failed");
    return response(503);
  }
}
