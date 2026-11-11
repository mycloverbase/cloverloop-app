import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCreatorContext } from "@/lib/account/server";
import {
  manuallyEnrolFounderCreatorAction,
  overrideFounderAttributionAction,
} from "@/app/dashboard/admin/actions";

export const metadata: Metadata = {
  title: "Founding Creator administration | CloverLoop",
  robots: { index: false, follow: false },
};

type FounderCreatorReport = {
  founderRegistrations: number;
  publishedReferredCreators: number;
  allocated: number;
  remaining: number;
  creators: {
    creatorId: string;
    creatorName: string;
    creatorEmail: string | null;
    referralSource: string;
    attributionMethod: string;
    storefrontId: string | null;
    storefrontName: string | null;
    storefrontUsername: string | null;
    storefrontPublishedAt: string | null;
    allocationNumber: number | null;
    activatedAt: string | null;
    expiresAt: string | null;
    programmeStatus: string;
  }[];
  audit: {
    id: string;
    creatorId: string;
    action: string;
    reason: string | null;
    actorUserId: string | null;
    createdAt: string;
  }[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function displayDate(value: string | null): string {
  return value
    ? new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })
    : "—";
}

function parseReport(value: unknown): FounderCreatorReport | null {
  if (
    !isRecord(value) ||
    typeof value.founderRegistrations !== "number" ||
    typeof value.publishedReferredCreators !== "number" ||
    typeof value.allocated !== "number" ||
    typeof value.remaining !== "number" ||
    !Array.isArray(value.creators) ||
    !Array.isArray(value.audit)
  ) return null;
  return value as FounderCreatorReport;
}

export default async function FoundingCreatorsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string; allocation?: string }>;
}) {
  const { supabase, user } = await requireCreatorContext();
  if (user.app_metadata?.role !== "admin") redirect("/dashboard");

  const { data, error } = await supabase.rpc("admin_founding_programme_report");
  if (error) {
    console.error("Could not load the Founding Creator Programme report.", error);
    throw new Error("The Founding Creator Programme report could not be loaded.");
  }
  const report = parseReport(data);
  if (!report) throw new Error("The Founding Creator Programme report was invalid.");
  const params = await searchParams;
  const resultMessage = params.result === "attribution-updated"
    ? "Referral attribution updated."
    : params.result === "enrolled"
      ? `Creator enrolled in allocation #${params.allocation ?? "?"}.`
      : params.result === "failed" || params.result === "enrolment-failed"
        ? "The operation could not be completed. Check the creator eligibility and programme capacity."
        : params.result === "invalid"
          ? "Enter a valid creator ID and a reason of 5–500 characters."
          : "";

  return (
    <div className="dashboard-page-content">
      <header className="dashboard-page-heading">
        <div>
          <span className="eyebrow">Admin-only</span>
          <h1>Founding Creator Programme</h1>
          <p>Monitor verified referrals, storefront publication, allocations and audit history.</p>
        </div>
      </header>
      {resultMessage ? <p className="dashboard-message" role="status">{resultMessage}</p> : null}
      <section className="dashboard-card" aria-labelledby="founder-manual-attribution-title">
        <h2 id="founder-manual-attribution-title">Manual attribution correction</h2>
        <p>Use only for verified exceptions. This does not bypass the 50-slot allocation limit.</p>
        <form action={overrideFounderAttributionAction} className="dashboard-admin-form">
          <label className="dashboard-field">
            <span>Creator account UUID</span>
            <input name="creator_id" required pattern="[0-9a-fA-F-]{36}" />
          </label>
          <label className="dashboard-field">
            <span>Correction</span>
            <select name="source" defaultValue="founder">
              <option value="founder">Attribute to founder link (verified manual override)</option>
              <option value="removed">Remove incorrect attribution</option>
            </select>
          </label>
          <label className="dashboard-field">
            <span>Reason</span>
            <input name="reason" minLength={5} maxLength={500} required />
          </label>
          <button className="dashboard-small-button" type="submit">Save manual correction</button>
        </form>
      </section>
      <section className="dashboard-overview-grid" aria-label="Programme totals">
        <article className="dashboard-card"><span className="dashboard-card-label">Founder registrations</span><h2>{report.founderRegistrations}</h2></article>
        <article className="dashboard-card"><span className="dashboard-card-label">Published referred storefronts</span><h2>{report.publishedReferredCreators}</h2></article>
        <article className="dashboard-card"><span className="dashboard-card-label">Allocated slots</span><h2>{report.allocated} / 50</h2><p>{report.remaining} remaining</p></article>
      </section>

      <section className="dashboard-card" aria-labelledby="founder-creators-list-title">
        <h2 id="founder-creators-list-title">Referred creators</h2>
        {report.creators.length ? report.creators.map((creator) => (
          <article className="dashboard-card" key={creator.creatorId}>
            <h3>{creator.creatorName} · {creator.creatorEmail ?? "No email"}</h3>
            <p>Creator ID: {creator.creatorId}</p>
            <p>Referral: {creator.referralSource} ({creator.attributionMethod}) · Storefront: {creator.storefrontUsername ? `/${creator.storefrontUsername}` : "not created"}</p>
            <p>Published: {displayDate(creator.storefrontPublishedAt)} · Status: {creator.programmeStatus}</p>
            <p>
              Allocation: {creator.allocationNumber ?? "—"} · Activated: {displayDate(creator.activatedAt)} ·
              {" "}Expires: {displayDate(creator.expiresAt)}
            </p>
            {creator.programmeStatus === "not_qualified" && creator.storefrontId ? (
              <form action={manuallyEnrolFounderCreatorAction} className="dashboard-admin-form">
                <input type="hidden" name="creator_id" value={creator.creatorId} />
                <label className="dashboard-field">
                  <span>Manual enrolment reason</span>
                  <input name="reason" minLength={5} maxLength={500} required />
                </label>
                <button className="dashboard-small-button" type="submit">Manually enrol (uses one of 50 slots)</button>
              </form>
            ) : null}
            <form action={overrideFounderAttributionAction} className="dashboard-admin-form">
              <input type="hidden" name="creator_id" value={creator.creatorId} />
              <label className="dashboard-field">
                <span>Correct referral attribution</span>
                <select name="source" defaultValue="founder">
                  <option value="founder">Founder</option>
                  <option value="removed">Remove incorrect attribution</option>
                </select>
              </label>
              <label className="dashboard-field">
                <span>Correction reason</span>
                <input name="reason" minLength={5} maxLength={500} required />
              </label>
              <button className="dashboard-small-button" type="submit">Save attribution correction</button>
            </form>
          </article>
        )) : <p>No founder-referred registrations yet.</p>}
      </section>

      <section className="dashboard-card" aria-labelledby="founder-audit-title">
        <h2 id="founder-audit-title">Recent audit history</h2>
        {report.audit.length ? (
          <ul>
            {report.audit.map((entry) => (
              <li key={entry.id}>
                {displayDate(entry.createdAt)} · {entry.action} · Creator {entry.creatorId}
                {entry.reason ? ` · ${entry.reason}` : ""}
              </li>
            ))}
          </ul>
        ) : <p>No programme changes have been recorded.</p>}
      </section>
    </div>
  );
}
