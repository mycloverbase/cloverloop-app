import { after } from "next/server";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getFreeProductDeliveryConfig,
  getRazorpayCheckoutConnection,
  getRazorpayPartnerTestWebhookSecret,
  getRazorpayTestWebhookSecret,
  isRazorpayPartnerWebhookFulfillmentEnabled,
  razorpayApiRequest,
  verifyRazorpayWebhookSignature,
} from "@/lib/razorpay/checkout";
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
    .select("razorpay_order_id")
    .eq("event_id", eventId)
    .maybeSingle();
  if (eventError) {
    console.error("Razorpay event order could not be loaded for purchase email delivery.", {
      code: eventError.code,
    });
    return;
  }
  if (!event || typeof event.razorpay_order_id !== "string") return;

  const { data: order, error: orderError } = await admin
    .from("razorpay_checkout_orders")
    .select("id")
    .eq("razorpay_order_id", event.razorpay_order_id)
    .eq("environment", "test")
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
): Promise<number> {
  const clientId = process.env.RAZORPAY_OAUTH_CLIENT_ID?.trim();
  if (!clientId) return 503;

  const { data: connection, error: connectionError } = await admin
    .from("creator_razorpay_connections")
    .select("creator_id,client_id")
    .eq("razorpay_account_id", accountId)
    .eq("environment", "test")
    .eq("connection_status", "connected")
    .maybeSingle();

  if (connectionError) {
    console.error("Razorpay partner webhook account mapping could not be checked.", {
      code: connectionError.code,
    });
    return 503;
  }
  if (
    !connection ||
    typeof connection.creator_id !== "string" ||
    connection.client_id !== clientId
  ) {
    console.warn("Razorpay partner webhook account is not a connected Test Mode creator.");
    return 400;
  }

  const eventRow = {
    event_id: eventId,
    event_type: eventType,
    razorpay_account_id: accountId,
    environment: "test",
    creator_id: connection.creator_id,
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
        "event_type,razorpay_account_id,environment,creator_id,razorpay_order_id,razorpay_payment_id,processing_status",
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
      existingEvent.environment === "test" &&
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
          creator_id: connection.creator_id,
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          processing_status: "received",
          processed_at: null,
          next_attempt_at: new Date().toISOString(),
          locked_until: null,
          last_error_code: null,
        })
        .eq("event_id", eventId)
        .eq("event_type", eventType)
        .eq("razorpay_account_id", accountId)
        .eq("environment", "test")
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
          "event_type,razorpay_account_id,environment,creator_id,razorpay_order_id,razorpay_payment_id,processing_status",
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
      existingEvent.creator_id === connection.creator_id &&
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
  if (process.env.RAZORPAY_OAUTH_MODE !== "test") return response(503);
  const admin = createSupabaseAdminClient();
  const accountWebhookSecret = getRazorpayTestWebhookSecret();
  const partnerWebhookSecret = getRazorpayPartnerTestWebhookSecret();
  const partnerFulfillmentEnabled =
    isRazorpayPartnerWebhookFulfillmentEnabled();
  if (!admin || (!accountWebhookSecret && !partnerFulfillmentEnabled)) {
    return response(503);
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");
  if (
    accountWebhookSecret &&
    partnerWebhookSecret &&
    accountWebhookSecret === partnerWebhookSecret
  ) {
    console.error("Razorpay account and partner Test Mode webhook secrets must be distinct.");
    return response(503);
  }

  const accountSignatureValid = accountWebhookSecret
    ? verifyRazorpayWebhookSignature(rawBody, signature, accountWebhookSecret)
    : false;
  const partnerSignatureValid =
    partnerFulfillmentEnabled && partnerWebhookSecret
    ? verifyRazorpayWebhookSignature(rawBody, signature, partnerWebhookSecret)
    : false;

  if (!accountSignatureValid && partnerSignatureValid) {
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
    if (eventType !== "payment.captured") return response(200);

    const payload = isRecord(event.payload) ? event.payload : {};
    const paymentEntity =
      isRecord(payload.payment) && isRecord(payload.payment.entity)
        ? payload.payment.entity
        : null;
    const accountId = diagnosticIdentifier(event.account_id, "acc");
    const paymentId = diagnosticIdentifier(paymentEntity?.id, "pay");
    const orderId = diagnosticIdentifier(paymentEntity?.order_id, "order");
    const embeddedAccountId = paymentEntity?.account_id;
    const eventId = request.headers.get("x-razorpay-event-id");
    if (
      !accountId ||
      !paymentId ||
      !orderId ||
      (typeof embeddedAccountId === "string" && embeddedAccountId !== accountId) ||
      (embeddedAccountId !== undefined && typeof embeddedAccountId !== "string") ||
      !eventId ||
      eventId.length > 200
    ) {
      return response(400);
    }

    const status = await enqueuePartnerPaymentEvent(
      admin,
      eventId,
      eventType,
      accountId,
      paymentId,
      orderId,
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
