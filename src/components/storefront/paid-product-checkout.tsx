"use client";

import Link from "next/link";
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
  customerName: string;
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
  prefill: { name: string; email: string };
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
  storefrontUrl: string;
  supportEmail: string | null;
  pricePaise: number;
  enabled: boolean;
};

type PurchaseEmailStatus = "pending" | "processing" | "accepted" | "delivered" | "failed" | "suppressed";

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
    typeof result.customerEmail === "string" &&
    typeof result.customerName === "string"
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

function isPurchaseEmailStatus(value: unknown): value is PurchaseEmailStatus {
  return ["pending", "processing", "accepted", "delivered", "failed", "suppressed"].includes(String(value));
}

function maskEmail(email: string): string {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return "your email address";
  return `${localPart.slice(0, 1)}${"*".repeat(Math.min(Math.max(localPart.length - 1, 2), 6))}@${domain}`;
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
  storefrontUrl,
  supportEmail,
  pricePaise,
  enabled,
}: Props) {
  const checkoutTokenRef = useRef<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [checkout, setCheckout] = useState<CheckoutDetails | null>(null);
  const [paid, setPaid] = useState(false);
  const [purchaseEmailStatus, setPurchaseEmailStatus] = useState<PurchaseEmailStatus>("pending");

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
      description: order.productDescription || productDescription || productName,
      order_id: order.razorpayOrderId,
      prefill: { name: order.customerName, email: order.customerEmail },
      theme: { color: "#1b4332" },
      handler: async (result) => {
        try {
          await verifyPayment(result, order, token);
        } catch (caught) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Payment status could not be checked. Please retry.",
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
    let orderPaid = paid;
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
          purchaseEmailStatus?: unknown;
        };
        if (status.orderStatus === "paid") {
          orderPaid = true;
          setPaid(true);
          if (status.fulfillmentStatus === "blocked") {
            setStatusMessage(
              "Payment was received, but this product is no longer available. Please contact support.",
            );
            return;
          }
          if (status.fulfillmentStatus === "ready") {
            const emailStatus = isPurchaseEmailStatus(status.purchaseEmailStatus)
              ? status.purchaseEmailStatus
              : "pending";
            setPurchaseEmailStatus(emailStatus);
            if (emailStatus === "delivered" || emailStatus === "failed" || emailStatus === "suppressed") {
              return;
            }
            setStatusMessage("Payment verified. We are confirming delivery of your download email.");
          }
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    setStatusMessage(
      orderPaid
        ? "Your payment is confirmed. Email delivery is still being processed; check back shortly."
        : "Razorpay is still confirming your payment. You can check again shortly.",
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
          customerName: customerName.trim(),
          email: email.trim().toLowerCase(),
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
      setCheckout(data);
      await openCheckout(data, token);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to start checkout.");
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
      setError(caught instanceof Error ? caught.message : "Unable to reopen checkout.");
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
      setError("Unable to check purchase status. Please retry shortly.");
    }
  }

  const formattedPrice = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(pricePaise / 100);

  return (
    <div className="storefront-product-checkout">
      {paid ? (
        <section className="product-purchase-confirmation" role="status" aria-live="polite">
          <span className="storefront-eyebrow">Payment successful</span>
          <h2>{statusMessage.includes("no longer available") ? "We need to help with this order" : "Thank you for your purchase"}</h2>
          <p><strong>{productName}</strong></p>
          {purchaseEmailStatus === "delivered" ? (
            <p>
              Your secure download link has been sent to <strong>{checkout ? maskEmail(checkout.customerEmail) : "your email address"}</strong>.
              Check your inbox and spam folder.
            </p>
          ) : purchaseEmailStatus === "failed" || purchaseEmailStatus === "suppressed" ? (
            <p>
              {purchaseEmailStatus === "suppressed"
                ? "The payment is verified, but the email provider could not deliver the message. Automated retries are paused."
                : "The payment is verified, but the download email could not be delivered. Our system will retry."}
              {supportEmail ? <> If it does not arrive, contact <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.</> : " Please contact the creator for help."}
            </p>
          ) : statusMessage.includes("no longer available") ? (
            <p>{statusMessage}</p>
          ) : (
            <p>{statusMessage || "Your download email is being processed. Check back shortly."}</p>
          )}
          {purchaseEmailStatus !== "delivered" && !statusMessage.includes("no longer available") ? (
            <button type="button" className="product-checkout-status-button" onClick={() => void checkStatusAgain()}>
              Check email status
            </button>
          ) : null}
          <Link className="product-checkout-store-link" href={storefrontUrl}>Return to {storefrontName}</Link>
        </section>
      ) : (
        <>
          {!enabled ? (
            <button className="storefront-product-action" type="button" disabled>
              Payments coming soon
            </button>
          ) : checkout ? (
            <>
              <button
                className="storefront-product-action"
                type="button"
                onClick={() => void reopenCheckout()}
                disabled={loading}
              >
                {loading ? "Preparing checkout..." : `Pay ${formattedPrice} securely`}
              </button>
              <button type="button" className="product-checkout-status-button" onClick={() => void checkStatusAgain()}>
                Check payment status
              </button>
            </>
          ) : (
            <form className="storefront-product-checkout-form" onSubmit={startCheckout}>
              <label htmlFor={`checkout-name-${productId}`}>Full name</label>
              <input
                className="storefront-product-checkout-input"
                id={`checkout-name-${productId}`}
                name="name"
                type="text"
                autoComplete="name"
                required
                maxLength={120}
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                placeholder="Your full name"
                disabled={loading}
              />
              <label htmlFor={`checkout-email-${productId}`}>Email address</label>
              <input
                className="storefront-product-checkout-input"
                id={`checkout-email-${productId}`}
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                disabled={loading}
              />
              <button className="storefront-product-action" type="submit" disabled={loading}>
                {loading ? "Preparing checkout..." : `Pay ${formattedPrice} securely`}
              </button>
              <p className="product-checkout-security">Secure payment processed by Razorpay. Your download link will be emailed after payment verification.</p>
              <p className="product-checkout-disclaimer">Digital products are delivered electronically. Please review the product details before purchasing.</p>
            </form>
          )}
          {error ? <p role="alert">{error}</p> : null}
          {statusMessage ? <p aria-live="polite">{statusMessage}</p> : null}
        </>
      )}
    </div>
  );
}
