import { NextResponse } from "next/server";
import { checkFreeProductRateLimit } from "@/lib/free-products/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isRazorpayPurchaseEmailDeliveryConfigured } from "@/lib/razorpay/purchase-email";
import {
  getFreeProductDeliveryConfig,
  getRazorpayCheckoutConnection,
  hashCheckoutToken,
  isRazorpayPartnerWebhookFulfillmentEnabled,
  isRazorpayCheckoutEnabled,
  isValidCheckoutToken,
  normalizeCustomerEmail,
  RazorpayApiError,
  razorpayApiRequest,
} from "@/lib/razorpay/checkout";

type CreatedOrder = {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
};

type CheckoutOrderRow = {
  order_id: string;
  creator_id: string;
  storefront_id: string;
  storefront_name: string;
  storefront_username: string;
  product_id: string;
  product_name: string;
  product_description: string | null;
  amount_paise: number;
  currency: string;
  razorpay_order_id: string | null;
  should_create_provider_order: boolean;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isCheckoutOrderRow(value: unknown): value is CheckoutOrderRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<CheckoutOrderRow>;
  return (
    typeof row.order_id === "string" &&
    typeof row.creator_id === "string" &&
    typeof row.storefront_id === "string" &&
    typeof row.product_id === "string" &&
    typeof row.amount_paise === "number" &&
    typeof row.should_create_provider_order === "boolean"
  );
}

async function releaseProviderCreationClaim(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  orderId: string,
) {
  const { error } = await admin.rpc("mark_razorpay_checkout_order_failed", {
    p_order_id: orderId,
  });
  if (error) console.error("Razorpay order creation claim could not be released.");
}

export async function POST(request: Request) {
  if (!isRazorpayCheckoutEnabled()) {
    return jsonResponse({ error: "Checkout is not available." }, 503);
  }

  if (process.env.RAZORPAY_OAUTH_MODE !== "test") {
    return jsonResponse({ error: "Test Mode checkout is not configured." }, 503);
  }

  if (!isRazorpayPartnerWebhookFulfillmentEnabled()) {
    return jsonResponse(
      { error: "Test Mode payment notifications are not configured." },
      503,
    );
  }

  if (!isRazorpayPurchaseEmailDeliveryConfigured()) {
    return jsonResponse({ error: "Purchase email delivery is not configured." }, 503);
  }

  const admin = createSupabaseAdminClient();
  const deliveryConfig = getFreeProductDeliveryConfig();
  if (!admin || !deliveryConfig) {
    return jsonResponse({ error: "Checkout is not configured." }, 503);
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return jsonResponse({ error: "Invalid checkout request." }, 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "Invalid checkout request." }, 400);
  }

  const productId = body.productId;
  const storefrontUsername = body.storefrontUsername;
  const email = normalizeCustomerEmail(body.email);
  const checkoutToken = body.checkoutToken;
  const customerName =
    typeof body.customerName === "string" ? body.customerName.trim() : "";

  if (
    typeof productId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      productId,
    ) ||
    typeof storefrontUsername !== "string" ||
    !/^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$/i.test(storefrontUsername) ||
    !email ||
    !isValidCheckoutToken(checkoutToken) ||
    customerName.length < 1 ||
    customerName.length > 120
  ) {
    return jsonResponse({ error: "Invalid checkout details." }, 400);
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  const clientIp = forwardedFor?.split(",")[0]?.trim() || "unknown";
  let withinRateLimit: boolean;
  try {
    withinRateLimit = await checkFreeProductRateLimit(admin, [
      { key: `razorpay-checkout:${clientIp}`, maxRequests: 20 },
    ]);
  } catch {
    console.error("Razorpay checkout rate limit could not be checked.");
    return jsonResponse({ error: "Checkout is temporarily unavailable." }, 503);
  }
  if (!withinRateLimit) {
    return jsonResponse(
      { error: "Too many checkout attempts. Please try again later." },
      429,
    );
  }

  const { data: rpcResult, error: rpcError } = await admin.rpc(
    "create_razorpay_checkout_order",
    {
      p_product_id: productId,
      p_storefront_username: storefrontUsername,
      p_customer_email: email,
      p_customer_name: customerName,
      p_customer_phone: null,
      p_checkout_token_hash: hashCheckoutToken(checkoutToken),
    },
  );

  if (rpcError) {
    if (rpcError.message.includes("product_not_available")) {
      return jsonResponse({ error: "This product is no longer available." }, 404);
    }
    if (rpcError.message.includes("checkout_key_conflict")) {
      return jsonResponse({ error: "This checkout session cannot be reused." }, 409);
    }
    if (
      rpcError.message.includes("checkout_already_paid") ||
      rpcError.message.includes("checkout_order_failed")
    ) {
      return jsonResponse({ error: "This checkout session is no longer available." }, 409);
    }
    console.error("Razorpay checkout order could not be initialized.");
    return jsonResponse({ error: "Unable to start checkout." }, 500);
  }

  const rowValue = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
  if (!isCheckoutOrderRow(rowValue)) {
    console.error("Razorpay checkout order RPC returned an invalid result.");
    return jsonResponse({ error: "Unable to start checkout." }, 500);
  }
  const order = rowValue;

  const connection = await getRazorpayCheckoutConnection(order.creator_id);
  if (!connection) {
    await releaseProviderCreationClaim(admin, order.order_id);
    return jsonResponse(
      { error: "The creator's Razorpay Test Mode connection is unavailable." },
      409,
    );
  }

  let razorpayOrderId = order.razorpay_order_id;
  if (!razorpayOrderId && order.should_create_provider_order) {
    try {
      const created = await razorpayApiRequest<CreatedOrder>(
        connection.accessToken,
        "/v1/orders",
        {
          method: "POST",
          body: JSON.stringify({
            amount: order.amount_paise,
            currency: order.currency,
            receipt: order.order_id,
            notes: {
              cloverloop_order_id: order.order_id,
              cloverloop_creator_id: order.creator_id,
              cloverloop_product_id: order.product_id,
            },
          }),
        },
      );

      if (
        typeof created.id !== "string" ||
        created.amount !== order.amount_paise ||
        created.currency !== order.currency ||
        created.receipt !== order.order_id
      ) {
        console.error(
          "Razorpay order creation returned an unexpected response; the idempotency claim remains locked.",
        );
        return jsonResponse({ error: "Unable to create the Razorpay order." }, 502);
      }

      const { error: saveError } = await admin
        .from("razorpay_checkout_orders")
        .update({
          razorpay_order_id: created.id,
          provider_creation_status: "created",
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.order_id)
        .is("razorpay_order_id", null);

      if (saveError) {
        console.error("Razorpay order could not be linked to the checkout.");
        return jsonResponse(
          { error: "Checkout is being prepared. Please retry in a moment." },
          503,
        );
      }
      razorpayOrderId = created.id;
    } catch (error) {
      if (
        error instanceof RazorpayApiError &&
        error.status >= 400 &&
        error.status < 500
      ) {
        await releaseProviderCreationClaim(admin, order.order_id);
      } else {
        console.error(
          "Razorpay order creation outcome is uncertain; the idempotency claim remains locked.",
        );
      }
      return jsonResponse({ error: "Unable to create the Razorpay order." }, 502);
    }
  }

  if (!razorpayOrderId) {
    return jsonResponse(
      {
        error:
          "Checkout is still being prepared. Please retry shortly; contact support if it persists.",
      },
      409,
    );
  }

  return jsonResponse({
    orderId: order.order_id,
    razorpayOrderId,
    amount: order.amount_paise,
    currency: order.currency,
    publicKey: connection.publicToken,
    productName: order.product_name,
    productDescription: order.product_description,
    storefrontName: order.storefront_name,
    customerEmail: email,
    customerName,
  });
}
