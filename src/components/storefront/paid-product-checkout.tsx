"use client";

import { type FormEvent, useRef, useState } from "react";

type CheckoutDetails = {
  orderId: string;
  razorpayOrderId: string;
  amount: number;
  currency: string;
  publicKey: string;
  productName: string;
  productDescription: string | null;
  storefrontName: string;
  customerEmail: string;
};

type RazorpayCheckoutResult = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature?: string;
};

type RazorpayCheckoutOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: { email: string };
  theme: { color: string };
  handler: (result: RazorpayCheckoutResult) => void | Promise<void>;
  modal: { ondismiss: () => void };
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => {
      open: () => void;
    };
  }
}

type Props = {
  productId: string;
  storefrontUsername: string;
  storefrontName: string;
  productName: string;
  productDescription: string | null;
  enabled: boolean;
};

function isCheckoutDetails(value: unknown): value is CheckoutDetails {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<CheckoutDetails>;
  return (
    typeof result.orderId === "string" &&
    typeof result.razorpayOrderId === "string" &&
    typeof result.amount === "number" &&
    typeof result.currency === "string" &&
    typeof result.publicKey === "string" &&
    typeof result.productName === "string" &&
    typeof result.storefrontName === "string" &&
    typeof result.customerEmail === "string"
  );
}

function getErrorMessage(value: unknown, fallback: string): string {
  if (
    value &&
    typeof value === "object" &&
    "error" in value &&
    typeof value.error === "string"
  ) {
    return value.error;
  }
  return fallback;
}

async function loadCheckoutScript(): Promise<boolean> {
  if (window.Razorpay) return true;

  const existing = document.querySelector<HTMLScriptElement>(
    'script[src="https://checkout.razorpay.com/v1/checkout.js"]',
  );
  if (existing) {
    return new Promise((resolve) => {
      const timeout = window.setTimeout(() => resolve(false), 8000);
      existing.addEventListener(
        "load",
        () => {
          window.clearTimeout(timeout);
          resolve(Boolean(window.Razorpay));
        },
        { once: true },
      );
      existing.addEventListener(
        "error",
        () => {
          window.clearTimeout(timeout);
          resolve(false);
        },
        { once: true },
      );
    });
  }

  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function PaidProductCheckout({
  productId,
  storefrontUsername,
  storefrontName,
  productName,
  productDescription,
  enabled,
}: Props) {
  const checkoutTokenRef = useRef<string | null>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [checkout, setCheckout] = useState<CheckoutDetails | null>(null);
  const [paid, setPaid] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);

  function getCheckoutToken(): string {
    if (!checkoutTokenRef.current) {
      checkoutTokenRef.current = crypto.randomUUID();
    }
    return checkoutTokenRef.current;
  }

  async function openCheckout(order: CheckoutDetails, token: string) {
    if (!(await loadCheckoutScript()) || !window.Razorpay) {
      throw new Error("Razorpay Checkout could not be loaded. Please try again.");
    }

    const checkoutWindow = new window.Razorpay({
      key: order.publicKey,
      amount: order.amount,
      currency: order.currency,
      name: order.storefrontName || storefrontName,
      description:
        order.productDescription || productDescription || productName,
      order_id: order.razorpayOrderId,
      prefill: { email: order.customerEmail },
      theme: { color: "#635bff" },
      handler: async (result) => {
        try {
          await verifyPayment(result, order, token);
        } catch (caught) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Payment verification could not complete.",
          );
        }
      },
      modal: {
        ondismiss: () => {
          setStatusMessage("Checkout was closed. No payment confirmation was received.");
        },
      },
    });
    checkoutWindow.open();
  }

  async function pollOrderStatus(order: CheckoutDetails, token: string) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const response = await fetch(
        `/api/checkout/order-status?orderId=${encodeURIComponent(order.orderId)}`,
        {
          headers: { "x-checkout-token": token },
          cache: "no-store",
        },
      );
      const result: unknown = await response.json();
      if (response.ok && result && typeof result === "object") {
        const status = result as {
          orderStatus?: string;
          fulfillmentStatus?: string;
        };
        if (status.orderStatus === "paid" && status.fulfillmentStatus === "ready") {
          setPaid(true);
          setStatusMessage("Payment confirmed. Your download is ready.");
          return;
        }
        if (status.orderStatus === "paid" && status.fulfillmentStatus === "blocked") {
          setStatusMessage(
            "Payment was received, but this product is no longer available. Please contact the creator.",
          );
          return;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    setStatusMessage(
      "Razorpay is still confirming your payment. You can check again shortly.",
    );
  }

  async function verifyPayment(
    result: RazorpayCheckoutResult,
    order: CheckoutDetails,
    token: string,
  ) {
    setStatusMessage("Verifying payment securely with Razorpay...");
    const response = await fetch("/api/checkout/verify-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checkoutToken: token,
        orderId: order.orderId,
        razorpayOrderId: result.razorpay_order_id,
        razorpayPaymentId: result.razorpay_payment_id,
      }),
    });
    const data: unknown = await response.json();
    if (!response.ok && response.status !== 402) {
      throw new Error(getErrorMessage(data, "Payment verification could not complete."));
    }
    if (response.status === 402) {
      setStatusMessage(getErrorMessage(data, "The payment did not complete."));
      return;
    }
    await pollOrderStatus(order, token);
  }

  async function startCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enabled || loading) return;

    setLoading(true);
    setError("");
    setStatusMessage("");
    setPaid(false);

    try {
      const token = getCheckoutToken();
      if (checkout) {
        await openCheckout(checkout, token);
        return;
      }

      const response = await fetch("/api/checkout/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          storefrontUsername,
          email,
          checkoutToken: token,
        }),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        throw new Error(getErrorMessage(data, "Unable to start checkout."));
      }
      if (!isCheckoutDetails(data)) {
        throw new Error("Checkout returned an invalid response.");
      }
      const order = data;

      setCheckout(order);
      await openCheckout(order, token);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to start checkout.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function reopenCheckout() {
    if (!checkout || !checkoutTokenRef.current || loading) return;
    setLoading(true);
    setError("");
    setStatusMessage("");
    try {
      await openCheckout(checkout, checkoutTokenRef.current);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to reopen checkout.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function checkStatusAgain() {
    if (!checkout || !checkoutTokenRef.current) return;
    setError("");
    try {
      await pollOrderStatus(checkout, checkoutTokenRef.current);
    } catch {
      setError("Unable to check payment status. Please retry shortly.");
    }
  }

  async function downloadPurchase() {
    if (!checkoutTokenRef.current || downloadLoading) return;
    setDownloadLoading(true);
    setError("");
    try {
      const response = await fetch("/api/purchase-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkoutToken: checkoutTokenRef.current }),
      });
      const data: unknown = await response.json();
      if (!response.ok || !data || typeof data !== "object" || !("downloadUrl" in data)) {
        throw new Error(getErrorMessage(data, "Unable to prepare the download."));
      }
      const downloadUrl = (data as { downloadUrl: string }).downloadUrl;
      if (typeof downloadUrl !== "string") {
        throw new Error("Unable to prepare the download.");
      }
      window.location.assign(downloadUrl);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to prepare the download.",
      );
    } finally {
      setDownloadLoading(false);
    }
  }

  return (
    <div className="storefront-product-checkout">
      {!enabled ? (
        <button className="storefront-product-action" type="button" disabled>
          Payments coming soon
        </button>
      ) : paid ? (
        <button
          className="storefront-product-action"
          type="button"
          onClick={downloadPurchase}
          disabled={downloadLoading}
        >
          {downloadLoading ? "Preparing download..." : "Download product"}
        </button>
      ) : checkout ? (
        <button
          className="storefront-product-action"
          type="button"
          onClick={() => void reopenCheckout()}
          disabled={loading}
        >
          {loading ? "Preparing checkout..." : "Retry payment"}
        </button>
      ) : (
        <form className="storefront-product-checkout-form" onSubmit={startCheckout}>
          <label className="sr-only" htmlFor={`checkout-email-${productId}`}>
            Email address
          </label>
          <input
            className="storefront-product-checkout-email"
            id={`checkout-email-${productId}`}
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Your email"
            disabled={loading}
          />
          <button
            className="storefront-product-action"
            type="submit"
            disabled={loading}
          >
            {loading ? "Preparing checkout..." : `Buy ${productName}`}
          </button>
        </form>
      )}
      {error ? <p role="alert">{error}</p> : null}
      {statusMessage ? <p aria-live="polite">{statusMessage}</p> : null}
      {checkout && !paid && statusMessage.includes("check again") ? (
        <button type="button" onClick={() => void checkStatusAgain()}>
          Check payment status
        </button>
      ) : null}
    </div>
  );
}
