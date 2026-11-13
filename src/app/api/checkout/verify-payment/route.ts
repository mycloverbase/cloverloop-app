import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getRazorpayCheckoutConnection,
  hashCheckoutToken,
  isRazorpayCheckoutEnabled,
  isValidCheckoutToken,
  razorpayApiRequest,
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
};

type CheckoutOrder = {
  id: string;
  creator_id: string;
  amount_paise: number;
  currency: string;
  razorpay_order_id: string;
  order_status: string;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  if (!isRazorpayCheckoutEnabled() || process.env.RAZORPAY_OAUTH_MODE !== "test") {
    return jsonResponse({ error: "Checkout is not available." }, 503);
  }

  const admin = createSupabaseAdminClient();
  if (!admin) return jsonResponse({ error: "Checkout is not configured." }, 503);

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return jsonResponse({ error: "Invalid payment verification request." }, 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "Invalid payment verification request." }, 400);
  }

  const { checkoutToken, orderId, razorpayOrderId, razorpayPaymentId } = body;
  if (
    !isValidCheckoutToken(checkoutToken) ||
    typeof orderId !== "string" ||
    typeof razorpayOrderId !== "string" ||
    typeof razorpayPaymentId !== "string" ||
    !/^order_[A-Za-z0-9]+$/.test(razorpayOrderId) ||
    !/^pay_[A-Za-z0-9]+$/.test(razorpayPaymentId)
  ) {
    return jsonResponse({ error: "Invalid payment verification details." }, 400);
  }

  const { data: order, error: orderError } = await admin
    .from("razorpay_checkout_orders")
    .select(
      "id,creator_id,amount_paise,currency,razorpay_order_id,order_status",
    )
    .eq("id", orderId)
    .eq("checkout_token_hash", hashCheckoutToken(checkoutToken))
    .eq("environment", "test")
    .maybeSingle();

  if (orderError) {
    console.error("Razorpay checkout order could not be loaded for verification.");
    return jsonResponse({ error: "Payment verification is temporarily unavailable." }, 503);
  }
  if (!order) {
    return jsonResponse({ error: "Checkout order could not be found." }, 404);
  }
  const checkoutOrder = order as CheckoutOrder;
  if (
    checkoutOrder.razorpay_order_id !== razorpayOrderId ||
    checkoutOrder.order_status === "failed"
  ) {
    return jsonResponse({ error: "Payment does not match this checkout." }, 409);
  }

  const connection = await getRazorpayCheckoutConnection(checkoutOrder.creator_id);
  if (!connection) {
    return jsonResponse({ error: "The creator's Razorpay connection is unavailable." }, 409);
  }

  try {
    const [providerOrder, payment] = await Promise.all([
      razorpayApiRequest<ProviderOrder>(
        connection.accessToken,
        `/v1/orders/${encodeURIComponent(razorpayOrderId)}`,
      ),
      razorpayApiRequest<ProviderPayment>(
        connection.accessToken,
        `/v1/payments/${encodeURIComponent(razorpayPaymentId)}`,
      ),
    ]);

    if (
      providerOrder.id !== razorpayOrderId ||
      providerOrder.amount !== checkoutOrder.amount_paise ||
      providerOrder.currency !== checkoutOrder.currency ||
      providerOrder.receipt !== checkoutOrder.id ||
      payment.id !== razorpayPaymentId ||
      payment.order_id !== razorpayOrderId ||
      payment.amount !== checkoutOrder.amount_paise ||
      payment.currency !== checkoutOrder.currency
    ) {
      return jsonResponse({ error: "Payment details did not match the order." }, 409);
    }

    const paymentStatus =
      payment.captured && payment.status === "captured"
        ? "captured"
        : payment.status === "failed"
          ? "failed"
          : payment.status === "authorized"
            ? "authorized"
            : null;

    if (paymentStatus) {
      const { error: insertAttemptError } = await admin
        .from("razorpay_payment_attempts")
        .insert({
          order_id: checkoutOrder.id,
          razorpay_payment_id: payment.id,
          payment_status: paymentStatus,
          amount_paise: payment.amount,
          currency: payment.currency,
          verified_at: new Date().toISOString(),
        });

      if (insertAttemptError) {
        const { data: existingAttempt, error: existingAttemptError } = await admin
          .from("razorpay_payment_attempts")
          .select("order_id")
          .eq("razorpay_payment_id", payment.id)
          .maybeSingle();

        if (existingAttemptError) {
          console.error("Razorpay payment attempt could not be checked.");
          return jsonResponse(
            { error: "Payment verification is temporarily unavailable." },
            503,
          );
        }
        if (existingAttempt?.order_id !== checkoutOrder.id) {
          return jsonResponse({ error: "Payment does not match this checkout." }, 409);
        }

        const { error: updateAttemptError } = await admin
          .from("razorpay_payment_attempts")
          .update({
            payment_status: paymentStatus,
            verified_at: new Date().toISOString(),
          })
          .eq("razorpay_payment_id", payment.id)
          .eq("order_id", checkoutOrder.id);
        if (updateAttemptError) {
          console.error("Razorpay payment verification could not be recorded.");
          return jsonResponse(
            { error: "Payment was verified but is still processing." },
            503,
          );
        }
      }
    }

    if (paymentStatus === "captured") {
      return jsonResponse({
        status: "processing",
        message: "Payment is verified. Securely confirming your purchase.",
      });
    }
    if (paymentStatus === "authorized") {
      return jsonResponse({
        status: "not_captured",
        message: "Payment is authorized but not yet captured.",
      });
    }
    if (paymentStatus === "failed") {
      return jsonResponse({ status: "failed", message: "The payment did not complete." }, 402);
    }

    return jsonResponse({
      status: "processing",
      message: "Payment status is being confirmed by Razorpay.",
    });
  } catch {
    return jsonResponse(
      { error: "Unable to verify payment with Razorpay. Please retry shortly." },
      502,
    );
  }
}
