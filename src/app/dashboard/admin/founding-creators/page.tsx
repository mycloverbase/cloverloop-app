import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminCreatorLookup } from "@/app/dashboard/admin/creator-lookup";
import { requireCreatorContext } from "@/lib/account/server";

export const metadata: Metadata = {
  title: "Founding Creator administration | CloverLoop",
  robots: { index: false, follow: false },
};

type EntitlementAuditEntry = {
  id: string;
  creatorEmail: string;
  action: "added" | "removed";
  allocationNumber: number;
  reason: string;
  actorEmail: string | null;
  activatedAt: string;
  expiresAt: string;
  createdAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAudit(value: unknown): EntitlementAuditEntry[] | null {
  if (!Array.isArray(value)) return null;
  const entries: EntitlementAuditEntry[] = [];
  for (const row of value) {
    if (
      !isRecord(row) ||
      typeof row.id !== "string" ||
      typeof row.creator_email !== "string" ||
      (row.action !== "added" && row.action !== "removed") ||
      typeof row.allocation_number !== "number" ||
      typeof row.reason !== "string" ||
      (row.actor_email !== null && typeof row.actor_email !== "string") ||
      typeof row.activated_at !== "string" ||
      typeof row.expires_at !== "string" ||
      typeof row.created_at !== "string"
    ) return null;
    entries.push({
      id: row.id,
      creatorEmail: row.creator_email,
      action: row.action,
      allocationNumber: row.allocation_number,
      reason: row.reason,
      actorEmail: row.actor_email,
      activatedAt: row.activated_at,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    });
  }
  return entries;
}

function displayDate(value: string): string {
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
}

function resultMessage(result: string | undefined): string {
  switch (result) {
    case "added":
      return "Founding Creator entitlement added for three months.";
    case "removed":
      return "Founding Creator entitlement removed. The benefit ended immediately.";
    case "already_active":
      return "This creator already has an active Founding Creator entitlement. No change was made.";
    case "not_active":
      return "This creator has no active Founding Creator entitlement to remove.";
    case "capacity_reached":
      return "All 50 Founding Creator programme slots have been allocated.";
    case "subscription_managed":
      return "This creator has a paid subscription. Change it through the payment provider before granting Founding Creator.";
    case "not_found":
      return "The creator account could not be found. Fetch the details again and retry.";
    case "invalid":
      return "Enter a reason of 5–500 characters.";
    case "failed":
      return "The entitlement change could not be completed. No successful action was recorded.";
    default:
      return "";
  }
}

export default async function FoundingCreatorsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string }>;
}) {
  const { supabase, user } = await requireCreatorContext();
  if (user.app_metadata?.role !== "admin") redirect("/dashboard");

  const { data, error } = await supabase.rpc("admin_founding_creator_entitlement_audit");
  if (error) {
    console.error("Could not load successful Founding Creator entitlement actions.", error);
    throw new Error("Founding Creator entitlement history could not be loaded.");
  }
  const audit = parseAudit(data);
  if (!audit) throw new Error("Founding Creator entitlement history was invalid.");

  const params = await searchParams;
  const message = resultMessage(params.result);

  return (
    <div className="dashboard-page-content">
      <header className="dashboard-page-heading">
        <div>
          <span className="eyebrow">Admin-only</span>
          <h1>Founding Creator</h1>
          <p>Look up a creator by registered email, then add or remove their entitlement.</p>
        </div>
      </header>
      {message ? <p className="dashboard-message" role="status">{message}</p> : null}
      <section className="dashboard-card">
        <p>
          An admin grant does not require a referral or published storefront. It uses one of
          the 50 programme slots and provides a three-month benefit. Creators with an active
          paid subscription cannot be granted through this tool.
        </p>
      </section>
      <AdminCreatorLookup mode="founding-creators" />

      <section className="dashboard-card" aria-labelledby="founder-audit-title">
        <h2 id="founder-audit-title">Recent successful entitlement actions</h2>
        <p>Only completed additions and removals appear here. Earlier referral and correction audit records are preserved.</p>
        {audit.length ? (
          <ul>
            {audit.map((entry) => (
              <li key={entry.id}>
                {displayDate(entry.createdAt)} · {entry.action === "added" ? "Added" : "Removed"} ·
                {" "}{entry.creatorEmail} · allocation #{entry.allocationNumber} · by {entry.actorEmail ?? "admin"}
                {" "}· benefit window {displayDate(entry.activatedAt)}–{displayDate(entry.expiresAt)}
                {" "}· {entry.reason}
              </li>
            ))}
          </ul>
        ) : <p>No successful add/remove actions have been recorded.</p>}
      </section>
    </div>
  );
}
