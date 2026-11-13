import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getFreeProductDeliveryConfig,
  getRazorpayCheckoutConnection,
  getRazorpayTestWebhookSecret,
  razorpayApiRequest,
  verifyRazorpayWebhookSignature,
} from "@/lib/razorpay/checkout";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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
  const secret = getRazorpayTestWebhookSecret();
  if (!admin || !secret) return response(503);

  const rawBody = await request.text();
  if (
    !verifyRazorpayWebhookSignature(
      rawBody,
      request.headers.get("x-razorpay-signature"),
      secret,
    )
  ) {
    return response(400);
  }

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
