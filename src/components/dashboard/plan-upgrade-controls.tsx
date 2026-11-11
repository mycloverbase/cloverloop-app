"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  requestProCreatorUpgradeAction,
  upgradeToCreatorPlanAction,
} from "@/app/dashboard/plan-actions";
import type { ActionResult } from "@/lib/account/types";

export function UpgradeToCreatorButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function upgrade() {
    if (!window.confirm(
      "Upgrade to Creator for ₹0/month to remove the ₹10,000 monthly Gross Sales limit and get unlimited paid and free product listings, with a 4% platform transaction fee on Gross Sales? Payment-provider processing charges and applicable GST are separate.",
    )) return;
    setPending(true);
    setMessage("");
    try {
      const result: ActionResult = await upgradeToCreatorPlanAction();
      setMessage(result.message);
      if (result.ok) router.refresh();
    } catch (error) {
      console.error("The Creator plan upgrade request failed.", error);
      setMessage("Your plan could not be updated. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button className="button" type="button" onClick={upgrade} disabled={pending}>
        {pending ? "Upgrading…" : "Upgrade to Creator"}
      </button>
      {message ? <p className="dashboard-message" role="status">{message}</p> : null}
    </>
  );
}

export function UpgradeToProCreatorButton() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function upgrade() {
    if (!window.confirm(
      "Pro Creator costs ₹2,999/month, excluding applicable GST, and has a 0% CloverLoop platform transaction fee. Payment-provider charges are additional. Continue to the subscription setup?",
    )) return;
    setPending(true);
    setMessage("");
    try {
      const result = await requestProCreatorUpgradeAction();
      setMessage(result.message);
    } catch (error) {
      console.error("The Pro Creator upgrade request failed.", error);
      setMessage("Your Pro Creator upgrade could not be started. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button className="button button-secondary" type="button" onClick={upgrade} disabled={pending}>
        {pending ? "Checking availability…" : "Upgrade to Pro Creator"}
      </button>
      {message ? <p className="dashboard-message" role="status">{message}</p> : null}
    </>
  );
}
