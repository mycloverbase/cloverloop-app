"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { upgradeToCreatorPlanAction } from "@/app/dashboard/plan-actions";
import type { ActionResult, CreatorPlanKey } from "@/lib/account/types";

const planNames: Record<CreatorPlanKey, string> = {
  free: "Free",
  creator: "Creator",
  pro_creator: "Pro Creator",
};

export function ChangeMyPlanControl({
  currentPlan,
}: {
  currentPlan: CreatorPlanKey;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<CreatorPlanKey>(currentPlan);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function confirmCreatorPlan() {
    if (currentPlan !== "free" || selectedPlan !== "creator") return;
    setPending(true);
    setMessage("");
    try {
      const result: ActionResult = await upgradeToCreatorPlanAction();
      setMessage(result.message);
      if (result.ok) router.refresh();
    } catch (error) {
      console.error("The Creator plan change request failed.", error);
      setMessage("Your plan could not be updated. Please try again.");
    } finally {
      setPending(false);
    }
  }

  function selectPlan(value: string) {
    if (value !== "free" && value !== "creator" && value !== "pro_creator") return;
    setSelectedPlan(value);
    setMessage("");
  }

  const isCreatorUpgrade = currentPlan === "free" && selectedPlan === "creator";
  const requiresSupport = selectedPlan !== currentPlan && (
    currentPlan === "pro_creator" ||
    (currentPlan === "creator" && selectedPlan === "free")
  );

  return (
    <div className="plan-change-control">
      <button
        className="button"
        type="button"
        aria-expanded={isOpen}
        aria-controls="creator-plan-selector"
        onClick={() => {
          setIsOpen((open) => !open);
          setSelectedPlan(currentPlan);
          setMessage("");
        }}
      >
        Change My Plan
      </button>

      {isOpen ? (
        <div className="plan-change-panel" id="creator-plan-selector">
          <label htmlFor="creator-plan-choice">Choose a plan</label>
          <select
            id="creator-plan-choice"
            value={selectedPlan}
            onChange={(event) => selectPlan(event.target.value)}
            disabled={pending}
          >
            <option value="free">Free{currentPlan === "free" ? " (Current plan)" : ""}</option>
            <option value="creator">Creator{currentPlan === "creator" ? " (Current plan)" : ""}</option>
            <option value="pro_creator" disabled>Pro Creator — ₹2,999/month (coming soon)</option>
          </select>

          <div className="plan-change-upcoming">
            <strong>Pro Creator is coming soon</strong>
            <p>₹2,999/month plus applicable GST, with a 0% CloverLoop platform fee. Payment-provider charges are separate.</p>
            <p>Subscription setup is not available yet.</p>
          </div>

          {isCreatorUpgrade ? (
            <div className="plan-change-confirmation" aria-live="polite">
              <span className="plan-change-confirmation-label">Creator plan charges</span>
              <p>
                ₹0/month, plus a 4% CloverLoop platform transaction fee on eligible Gross Sales and applicable GST. Standard payment-provider charges are separate.
              </p>
              <p>
                Your Creator plan will be activated as soon as you confirm. Razorpay connection and consent may be required before accepting paid payments.
              </p>
              <button
                className="button"
                type="button"
                onClick={confirmCreatorPlan}
                disabled={pending}
              >
                {pending ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : null}
                {pending ? "Updating plan..." : "Confirm Creator Plan"}
              </button>
            </div>
          ) : requiresSupport ? (
            <div className="plan-change-support" role="status">
              {currentPlan === "creator" && selectedPlan === "free" ? (
                <>
                  <strong>Free plan charges</strong>
                  <p>
                    ₹0/month and a 0% CloverLoop platform fee up to ₹10,000 cumulative Gross Sales per creator account lifetime. The cap does not reset monthly. Free listing limits and separate payment-provider charges apply.
                  </p>
                  <p>
                    Creator-to-Free changes are handled by CloverLoop Support. Contact us to request this change.
                  </p>
                </>
              ) : (
                <p>
                  Changes from Pro Creator are handled by CloverLoop Support. Contact us to request a plan change.
                </p>
              )}
              <Link href="/dashboard/help">Contact support</Link>
            </div>
          ) : (
            <p className="plan-change-current" role="status">
              {planNames[selectedPlan]} is your current plan.
            </p>
          )}

          {message ? (
            <p className="dashboard-message" role="status" aria-live="polite">
              {message}
            </p>
          ) : null}
          <button
            className="plan-change-cancel"
            type="button"
            onClick={() => {
              setIsOpen(false);
              setSelectedPlan(currentPlan);
              setMessage("");
            }}
            disabled={pending}
          >
            Close
          </button>
        </div>
      ) : null}
    </div>
  );
}
