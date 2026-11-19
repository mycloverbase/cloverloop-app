"use client";

import { useState, type FormEvent } from "react";
import {
  changeFoundingCreatorEntitlementAction,
  changeCreatorPlanAction,
  lookupCreatorByEmailAction,
  restoreStorefrontAction,
} from "@/app/dashboard/admin/actions";

type LookupResult = Awaited<ReturnType<typeof lookupCreatorByEmailAction>>;

function displayDate(value: string | null): string {
  return value
    ? new Date(value).toLocaleString("en-IN", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
      })
    : "—";
}

export function AdminCreatorLookup({
  mode,
}: {
  mode: "plans" | "storefront-recovery" | "founding-creators";
}) {
  const [result, setResult] = useState<LookupResult | null>(null);
  const [pending, setPending] = useState(false);

  function lookupCreator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setResult(null);
    setPending(true);
    void lookupCreatorByEmailAction(formData)
      .then(setResult, () => {
        setResult({
          ok: false,
          message: "The lookup request failed. Check your connection and try again.",
        });
      })
      .finally(() => setPending(false));
  }

  return (
    <>
      <section className="dashboard-card">
        <form onSubmit={lookupCreator} className="dashboard-admin-form">
          <label className="dashboard-field">
            <span>Creator registered email</span>
            <input name="creator_email" type="email" autoComplete="email" required maxLength={254} />
          </label>
          <button className="dashboard-small-button" type="submit" disabled={pending}>
            {pending ? "Fetching details..." : "Fetch user details"}
          </button>
        </form>
        {result?.ok === false ? (
          <p className="dashboard-message dashboard-message-warning" role="alert">{result.message}</p>
        ) : null}
        {result?.ok === true && !result.creator ? (
          <p className="dashboard-message" role="status">No creator account was found for that email.</p>
        ) : null}
      </section>
      {result?.ok === true && result.creator ? (
        <section className="dashboard-card" aria-labelledby="admin-creator-details-title">
          <h2 id="admin-creator-details-title">Creator details</h2>
          <p>Profile name: {result.creator.profileName || "Not set"}</p>
          <p>Registered email: {result.creator.email}</p>
          <p>Storefront name: {result.creator.storefrontName || "No storefront"}</p>
          <p>Username: {result.creator.username ? `/${result.creator.username}` : "Not set"}</p>
          <p>
            Current plan: {result.creator.currentPlan === "pro_creator"
              ? "Pro Creator"
              : result.creator.currentPlan === "creator" && result.creator.founderStatus === "active"
                ? "Founding Creator (Creator base plan)"
                : result.creator.currentPlan === "creator" && result.creator.founderStatus === "expired"
                  ? "Creator (Founding Creator benefit expired)"
                  : result.creator.currentPlan === "creator"
                    ? "Creator"
                    : "Free"}
          </p>
          <p>Founding Creator status: {result.creator.founderStatus ?? "Not enrolled"}</p>
          <p>Status: {result.creator.storefrontStatus ?? "No storefront"}</p>
          {mode === "plans" ? (
            <form action={changeCreatorPlanAction} className="dashboard-admin-form">
              <input type="hidden" name="creator_id" value={result.creator.creatorId} />
              <label className="dashboard-field">
                <span>Plan</span>
                <select name="plan" defaultValue="" required>
                  <option value="" disabled>Select a plan</option>
                  <option value="free">Free</option>
                  <option value="creator">Creator</option>
                  <option value="founding_creator">Founding Creator (one slot, three months)</option>
                </select>
              </label>
              <label className="dashboard-field">
                <span>Reason</span>
                <input name="reason" minLength={5} maxLength={500} required />
              </label>
              <button className="dashboard-small-button" type="submit">Save plan change</button>
            </form>
          ) : mode === "founding-creators" ? (
            <>
              <p>
                Admin grants use one of the 50 programme slots and provide a three-month benefit.
                Removing an active entitlement ends the benefit immediately.
              </p>
              <form action={changeFoundingCreatorEntitlementAction} className="dashboard-admin-form">
              <input type="hidden" name="creator_id" value={result.creator.creatorId} />
              <input
                type="hidden"
                name="action"
                value={result.creator.founderStatus === "active" ? "remove" : "add"}
              />
              <label className="dashboard-field">
                <span>{result.creator.founderStatus === "active" ? "Removal reason" : "Grant reason"}</span>
                <input name="reason" minLength={5} maxLength={500} required />
              </label>
              <button className="dashboard-small-button" type="submit">
                {result.creator.founderStatus === "active"
                  ? "Remove Founding Creator entitlement"
                  : "Add Founding Creator entitlement"}
              </button>
              </form>
            </>
          ) : result.creator.storefrontStatus === "deletion_pending" ? (
            <>
              <p>Deletion requested: {displayDate(result.creator.deletedAt)}</p>
              <p>Permanent deletion after: {displayDate(result.creator.deleteAfter)}</p>
              {result.creator.canRestore && result.creator.storefrontId ? (
                <form action={restoreStorefrontAction} className="dashboard-admin-form">
                  <input type="hidden" name="storefront_id" value={result.creator.storefrontId} />
                  <label className="dashboard-field">
                    <span>Recovery reason</span>
                    <input name="reason" minLength={5} maxLength={500} required />
                  </label>
                  <button className="dashboard-small-button" type="submit">Restore as unpublished</button>
                </form>
              ) : (
                <p className="dashboard-message dashboard-message-warning" role="status">
                  This storefront is outside its recovery window and cannot be restored through this tool.
                </p>
              )}
            </>
          ) : result.creator.storefrontId ? (
            <p className="dashboard-message" role="status">This storefront is not pending deletion.</p>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
