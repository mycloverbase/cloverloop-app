"use client";

import { useEffect, useRef, useState } from "react";
import { startRazorpayConnectionAction } from "@/app/dashboard/razorpay/actions";
import { RazorpayActionButton } from "@/components/dashboard/razorpay-action-button";

export function RazorpayConnectFlow({
  requiresCommissionConsent,
  readinessAvailable,
  statusServiceAvailable,
  applicationKeyAvailable,
  applicationMismatch,
  reconnectRequired,
  creatorEmail,
  initialBusinessName,
}: {
  requiresCommissionConsent: boolean;
  readinessAvailable: boolean;
  statusServiceAvailable: boolean;
  applicationKeyAvailable: boolean;
  applicationMismatch: boolean;
  reconnectRequired: boolean;
  creatorEmail: string;
  initialBusinessName: string;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const businessNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (dialogOpen && !dialog.open) {
      dialog.showModal();
      businessNameRef.current?.focus();
    }
    if (!dialogOpen && dialog.open) dialog.close();
  }, [dialogOpen]);

  const label = applicationMismatch
    ? "Reconnect to Apply Plan"
    : reconnectRequired
      ? "Reconnect Razorpay"
      : "Connect Razorpay";

  if (!requiresCommissionConsent) {
    return (
      <form className="razorpay-connect-form" action={startRazorpayConnectionAction}>
        <div className="razorpay-connect-actions">
          <RazorpayActionButton
            className="button"
            disabled={!readinessAvailable || !statusServiceAvailable || !applicationKeyAvailable}
            label={label}
            pendingLabel="Connecting to Razorpay..."
          />
        </div>
      </form>
    );
  }

  return (
    <>
      <button
        className="button"
        type="button"
        disabled={!readinessAvailable || !statusServiceAvailable || !applicationKeyAvailable}
        onClick={() => setDialogOpen(true)}
      >
        {label}
      </button>
      <dialog
        ref={dialogRef}
        className="razorpay-consent-dialog"
        aria-labelledby="razorpay-consent-title"
        onClose={() => setDialogOpen(false)}
        onCancel={(event) => {
          if (submitting) {
            event.preventDefault();
            return;
          }
          setDialogOpen(false);
        }}
        onClick={(event) => {
          if (!submitting && event.target === event.currentTarget) setDialogOpen(false);
        }}
      >
        <div className="razorpay-consent-modal-content">
          <div className="razorpay-consent-modal-heading">
            <div>
              <span className="dashboard-card-label">Razorpay connection</span>
              <h2 id="razorpay-consent-title">Review and confirm</h2>
            </div>
            <button
              className="razorpay-consent-close"
              type="button"
              aria-label="Close confirmation"
              disabled={submitting}
              onClick={() => setDialogOpen(false)}
            >
              ×
            </button>
          </div>

          <p className="razorpay-consent-intro">
            Please verify your details and confirm the commission terms before continuing to Razorpay.
          </p>

          <form
            className="razorpay-consent-form"
            action={startRazorpayConnectionAction}
            onSubmit={() => setSubmitting(true)}
          >
            <div className="razorpay-consent">
              <p>
                I authorise Razorpay to deduct CloverLoop&apos;s additional 4% platform commission plus applicable GST on eligible successful transactions, subject to applicable platform and refund terms.
              </p>
              <div className="razorpay-consent-fields">
                <label>
                  Legal/Business Name
                  <input
                    ref={businessNameRef}
                    name="businessName"
                    type="text"
                    required
                    minLength={2}
                    maxLength={120}
                    autoComplete="organization"
                    defaultValue={initialBusinessName}
                  />
                </label>
                <label>
                  Registered Email Address
                  <input
                    name="razorpayEmail"
                    type="email"
                    required
                    maxLength={254}
                    autoComplete="email"
                    defaultValue={creatorEmail}
                  />
                </label>
              </div>
              <label className="razorpay-consent-checkbox">
                <input name="commissionConsent" type="checkbox" value="yes" required />
                <span>I have verified these details and explicitly agree to the commission and applicable terms.</span>
              </label>
            </div>

            <div className="razorpay-consent-modal-actions">
              <button
                className="button button-secondary"
                type="button"
                disabled={submitting}
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </button>
              <RazorpayActionButton
                className="button"
                disabled={!readinessAvailable || !statusServiceAvailable || !applicationKeyAvailable}
                label="Confirm and continue"
                pendingLabel="Connecting to Razorpay..."
              />
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
