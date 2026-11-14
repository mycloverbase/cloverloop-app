import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getFreeProductDeliveryConfig,
  getRazorpayCheckoutConnection,
  RazorpayApiError,
  razorpayApiRequest,
} from "@/lib/razorpay/checkout";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type WebhookClaim = {
  event_id: string;
  creator_id: string;
  razorpay_account_id: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
};

type InternalOrder = {
  id: string;
  creator_id: string;
  amount_paise: number;
  currency: string;
  razorpay_order_id: string;
  order_status: string;
};

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

type ProcessingResult = "processed" | "ignored" | "failed";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseClaim(value: unknown): WebhookClaim | null {
  if (
    !isRecord(value) ||
    typeof value.event_id !== "string" ||
    typeof value.creator_id !== "string" ||
    typeof value.razorpay_account_id !== "string" ||
    typeof value.razorpay_order_id !== "string" ||
    typeof value.razorpay_payment_id !== "string"
  ) {
    return null;
  }
  return {
    event_id: value.event_id,
    creator_id: value.creator_id,
    razorpay_account_id: value.razorpay_account_id,
    razorpay_order_id: value.razorpay_order_id,
    razorpay_payment_id: value.razorpay_payment_id,
  };
}

async function finishEvent(
  admin: AdminClient,
  claim: WebhookClaim,
  result: ProcessingResult,
  errorCode?: string,
): Promise<boolean> {
  const { data, error } = await admin.rpc(
    "finish_razorpay_partner_webhook_event",
    {
      p_event_id: claim.event_id,
      p_processing_status: result,
      p_error_code: errorCode ?? null,
    },
  );
  if (error || data !== true) {
    console.error("Razorpay partner webhook processing state could not be saved.", {
      code: error?.code ?? "lease_not_owned",
    });
    return false;
  }
  return true;
}

async function processClaim(
  admin: AdminClient,
  claim: WebhookClaim,
): Promise<ProcessingResult> {
  try {
    const { data: connectionRow, error: connectionError } = await admin
      .from("creator_razorpay_connections")
      .select("razorpay_account_id,client_id,environment,connection_status")
      .eq("creator_id", claim.creator_id)
      .maybeSingle();

    if (connectionError) {
      console.error("Razorpay partner webhook creator mapping could not be checked.", {
        code: connectionError.code,
      });
      return "failed";
    }

    const expectedClientId = process.env.RAZORPAY_OAUTH_CLIENT_ID?.trim();
    if (
      !connectionRow ||
      connectionRow.connection_status !== "connected" ||
      connectionRow.environment !== "test" ||
      connectionRow.client_id !== expectedClientId ||
      connectionRow.razorpay_account_id !== claim.razorpay_account_id
    ) {
      return "ignored";
    }

    const connection = await getRazorpayCheckoutConnection(claim.creator_id);
    if (
      !connection ||
      connection.environment !== "test" ||
      connection.accountId !== claim.razorpay_account_id
    ) {
      return "failed";
    }

    const { data: orderData, error: orderError } = await admin
      .from("razorpay_checkout_orders")
      .select(
        "id,creator_id,amount_paise,currency,razorpay_order_id,order_status",
      )
      .eq("creator_id", claim.creator_id)
      .eq("razorpay_order_id", claim.razorpay_order_id)
      .eq("environment", "test")
      .maybeSingle();

    if (orderError) {
      console.error("Razorpay partner webhook checkout order could not be loaded.", {
        code: orderError.code,
      });
      return "failed";
    }
    if (!orderData) return "ignored";

    const order = orderData as InternalOrder;
    if (
      order.creator_id !== claim.creator_id ||
      order.razorpay_order_id !== claim.razorpay_order_id ||
      order.order_status === "failed"
    ) {
      return "ignored";
    }

    const [providerOrder, payment] = await Promise.all([
      razorpayApiRequest<ProviderOrder>(
        connection.accessToken,
        `/v1/orders/${encodeURIComponent(claim.razorpay_order_id)}`,
        {},
        5_000,
      ),
      razorpayApiRequest<ProviderPayment>(
        connection.accessToken,
        `/v1/payments/${encodeURIComponent(claim.razorpay_payment_id)}`,
        {},
        5_000,
      ),
    ]);

    if (
      providerOrder.id !== claim.razorpay_order_id ||
      providerOrder.amount !== order.amount_paise ||
      providerOrder.currency !== order.currency ||
      providerOrder.receipt !== order.id ||
      payment.id !== claim.razorpay_payment_id ||
      payment.order_id !== claim.razorpay_order_id ||
      payment.amount !== order.amount_paise ||
      payment.currency !== order.currency ||
      (payment.account_id && payment.account_id !== claim.razorpay_account_id)
    ) {
      return "ignored";
    }

    if (payment.status !== "captured" || payment.captured !== true) {
      return "failed";
    }

    const deliveryConfig = getFreeProductDeliveryConfig();
    if (!deliveryConfig) {
      console.error("Paid product delivery limits are invalid.");
      return "failed";
    }

    const { error: recordError } = await admin.rpc(
      "record_razorpay_checkout_payment",
      {
        p_order_id: order.id,
        p_payment_id: payment.id,
        p_amount_paise: payment.amount,
        p_currency: payment.currency,
        p_payment_status: "captured",
        p_captured: true,
        p_max_downloads: deliveryConfig.maxDownloads,
        p_expiry_hours: deliveryConfig.expiryHours,
      },
    );

    if (recordError) {
      console.error("Razorpay partner payment could not be persisted.", {
        code: recordError.code,
      });
      return recordError.code === "22023" || recordError.code === "P0002"
        ? "ignored"
        : "failed";
    }

    return "processed";
  } catch (error) {
    console.error("Razorpay partner webhook event processing failed.", {
      code:
        error instanceof RazorpayApiError
          ? `provider_http_${error.status || "network"}`
          : "processing_error",
    });
    return "failed";
  }
}

export async function processRazorpayPartnerWebhookQueue(
  admin: AdminClient,
  eventId: string | null,
  batchSize = 1,
): Promise<{ claimed: number; processed: number; ignored: number; failed: number }> {
  const { data, error } = await admin.rpc(
    "claim_razorpay_partner_webhook_events",
    {
      p_event_id: eventId,
      p_batch_size: batchSize,
    },
  );
  if (error) {
    console.error("Razorpay partner webhook events could not be claimed.", {
      code: error.code,
    });
    return { claimed: 0, processed: 0, ignored: 0, failed: 0 };
  }
  if (!Array.isArray(data)) {
    console.error("Razorpay partner webhook claim response was invalid.");
    return { claimed: 0, processed: 0, ignored: 0, failed: 0 };
  }

  const claims = data.map(parseClaim);
  if (claims.some((claim) => !claim)) {
    console.error("A Razorpay partner webhook claim was invalid.");
  }
  const validClaims = claims.filter(
    (claim): claim is WebhookClaim => claim !== null,
  );
  const outcomes = await Promise.all(
    validClaims.map(async (claim) => {
      let result: ProcessingResult;
      try {
        result = await processClaim(admin, claim);
      } catch {
        console.error("Razorpay partner webhook event processing failed unexpectedly.");
        result = "failed";
      }
      const errorCode = result === "failed" ? "verification_or_persistence_failed" : undefined;
      try {
        if (!(await finishEvent(admin, claim, result, errorCode))) return "failed";
        return result;
      } catch {
        console.error("Razorpay partner webhook processing state could not be saved.");
        return "failed";
      }
    }),
  );

  return {
    claimed: validClaims.length,
    processed: outcomes.filter((outcome) => outcome === "processed").length,
    ignored: outcomes.filter((outcome) => outcome === "ignored").length,
    failed: outcomes.filter((outcome) => outcome === "failed").length,
  };
}
