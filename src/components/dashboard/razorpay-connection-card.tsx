import {
  disconnectRazorpayConnectionAction,
  startRazorpayConnectionAction,
} from "@/app/dashboard/razorpay/actions";
import {
  isRazorpayConnectionUsable,
  type RazorpayApplicationKey,
  type RazorpayOAuthEnvironment,
  type RazorpayOAuthReadiness,
} from "@/lib/razorpay/oauth";
import { RazorpayActionButton } from "@/components/dashboard/razorpay-action-button";

type RazorpayConnectionSummary = {
  accountId: string;
  applicationKey: RazorpayApplicationKey;
  creatorPlan: string | null;
  commissionRate: number | null;
  environment: RazorpayOAuthEnvironment;
  status: "connected" | "reconnect_required" | "revoked" | "disconnected";
  tokenExpiresAt: string | null;
  lastRefreshedAt: string | null;
};

const queryMessages: Record<string, { message: string; tone: "success" | "warning" | "error" }> = {
  connected: { message: "Your Razorpay account is connected.", tone: "success" },
  disconnected: { message: "Your Razorpay connection is disconnected.", tone: "success" },
  "disconnect-warning": {
    message: "The connection is disabled in CloverLoop, but Razorpay revocation could not be confirmed. Review connected apps in Razorpay.",
    tone: "warning",
  },
  "disconnect-error": {
    message: "CloverLoop could not update the connection. Refresh the page and try again.",
    tone: "error",
  },
  "service-unavailable": {
    message: "Razorpay connection services are unavailable. Contact CloverLoop support.",
    tone: "error",
  },
  "connect-error": {
    message: "The Razorpay connection could not be started. Please try again.",
    tone: "error",
  },
  "state-error": {
    message: "The Razorpay authorisation could not be validated. Start the connection again.",
    tone: "error",
  },
  "auth-session-expired": {
    message: "Your dashboard session expired during authorisation. Sign in and start the connection again.",
    tone: "warning",
  },
  "authorization-denied": {
    message: "Razorpay authorisation was not completed.",
    tone: "warning",
  },
  "exchange-error": {
    message: "Razorpay could not complete the account connection. Start again or contact support.",
    tone: "error",
  },
  "account-in-use": {
    message: "This Razorpay merchant account is already connected to another CloverLoop creator.",
    tone: "error",
  },
  "already-connected": {
    message: "A Razorpay account is already connected. Disconnect it before changing accounts.",
    tone: "warning",
  },
  "setup-required": {
    message: "Razorpay OAuth is not configured. Connection and checkout remain unavailable.",
    tone: "warning",
  },
  "audit-error": {
    message: "The connection was disabled, but CloverLoop could not record the audit entry. Contact support.",
    tone: "error",
  },
  "plan-unavailable": {
    message: "Your current plan could not be verified. Razorpay connection is unavailable.",
    tone: "error",
  },
  "plan-unsupported": {
    message: "Your current plan does not have a supported Razorpay commission configuration.",
    tone: "error",
  },
  "commission-consent-required": {
    message: "Accept the Creator Plan commission disclosure and provide the requested details before connecting.",
    tone: "warning",
  },
  "migration-error": {
    message: "The Razorpay application migration could not be recorded. Please retry or contact support.",
    tone: "error",
  },
  "plan-changed": {
    message: "Your plan changed while Razorpay authorisation was in progress. Start a new connection using the current plan.",
    tone: "warning",
  },
};

function formattedDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

export function RazorpayConnectionCard({
  readiness,
  connection,
  plan,
  applicationKey,
  creatorEmail,
  statusMessage,
  statusServiceAvailable,
}: {
  readiness: RazorpayOAuthReadiness;
  connection: RazorpayConnectionSummary | null;
  plan: string | null;
  applicationKey: RazorpayApplicationKey | null;
  creatorEmail: string;
  statusMessage: string | undefined;
  statusServiceAvailable: boolean;
}) {
  const currentMessage = statusMessage ? queryMessages[statusMessage] : undefined;
  const tokenExpiry = formattedDate(connection?.tokenExpiresAt ?? null);
  const lastRefresh = formattedDate(connection?.lastRefreshedAt ?? null);
  const applicationMatchesPlan = Boolean(
    connection &&
    applicationKey &&
    connection.applicationKey === applicationKey &&
    connection.commissionRate === (applicationKey === "FOUR_PERCENT" ? 4 : 0),
  );
  const tokenIsCurrent = connection && applicationMatchesPlan
    ? isRazorpayConnectionUsable(connection.status, connection.tokenExpiresAt)
    : false;
  const applicationMismatch = Boolean(connection && !applicationMatchesPlan);
  const requiresCommissionConsent = applicationKey === "FOUR_PERCENT";
  const canDisconnect = Boolean(
    connection && connection.status !== "disconnected",
  );

  return (
    <section className="dashboard-card" aria-labelledby="razorpay-connection-title">
      <span className="dashboard-card-label">Payments setup</span>
      <h2 id="razorpay-connection-title">Razorpay account</h2>
      <p>
        Connect your existing Razorpay merchant account through Technology Partner OAuth.
        CloverLoop will never ask for your Razorpay password or API secret.
      </p>

      {currentMessage ? (
        <p className={`dashboard-message dashboard-message-${currentMessage.tone}`} role="status" aria-live="polite">
          {currentMessage.message}
        </p>
      ) : null}

      {!statusServiceAvailable ? (
        <p className="dashboard-message dashboard-message-warning" role="status">
          Connection status could not be checked. Razorpay account services are not configured.
        </p>
      ) : connection ? (
        <div>
          <p>
            <strong>Status:</strong>{" "}
            {tokenIsCurrent
              ? "Connected"
              : connection.status === "connected"
                ? "Access token expired; reconnection or refresh is required"
                : connection.status === "reconnect_required"
                  ? "Reconnection required"
                  : connection.status === "revoked"
                    ? "Authorisation revoked"
                    : "Disconnected"}
          </p>
          <p><strong>Razorpay account:</strong> {connection.accountId}</p>
          <p><strong>Connected application:</strong> {connection.applicationKey === "ZERO_FEE" ? "0% commission" : "4% commission"}</p>
          <p><strong>Environment:</strong> {connection.environment === "test" ? "Test" : "Live"}</p>
          {applicationMismatch ? (
            <p className="dashboard-message dashboard-message-warning" role="status">
              This connection does not match your current plan commission. Reconnect Razorpay to begin a tracked application migration.
            </p>
          ) : null}
          {tokenExpiry ? <p><strong>Access token expires:</strong> {tokenExpiry}</p> : null}
          {lastRefresh ? <p><strong>Last token refresh:</strong> {lastRefresh}</p> : null}
        </div>
      ) : (
        <p><strong>Status:</strong> Not connected</p>
      )}

      {!readiness.available ? (
        <p className="product-manager-note">{readiness.message}</p>
      ) : null}
      {plan ? <p><strong>Current plan:</strong> {plan.replaceAll("_", " ")}</p> : null}

      <div className="dashboard-form-actions">
        {!tokenIsCurrent ? (
          <form action={startRazorpayConnectionAction}>
            {requiresCommissionConsent ? (
              <div className="dashboard-stack">
                <p>
                  I authorise CloverLoop to charge an additional platform commission of 4% on eligible successful transactions, plus applicable GST. I understand that this commission will be automatically deducted through Razorpay settlements, in addition to standard Razorpay payment gateway charges. I agree to the applicable platform commission and refund terms.
                </p>
                <label>
                  Legal or business name
                  <input name="businessName" type="text" required minLength={2} maxLength={120} autoComplete="organization" />
                </label>
                <label>
                  Registered Razorpay email
                  <input
                    name="razorpayEmail"
                    type="email"
                    required
                    maxLength={254}
                    autoComplete="email"
                    defaultValue={creatorEmail}
                  />
                </label>
                <label>
                  <input name="commissionConsent" type="checkbox" value="yes" required />
                  {" "}I explicitly accept the additional 4% platform commission, applicable GST, and the applicable platform commission and refund terms.
                </label>
              </div>
            ) : null}
            <RazorpayActionButton
              className="button"
              disabled={!readiness.available || !statusServiceAvailable || !applicationKey}
              label={applicationMismatch
                ? "Reconnect to apply plan"
                : connection?.status === "reconnect_required" || connection?.status === "revoked"
                ? "Reconnect Razorpay"
                : "Connect Razorpay"}
              pendingLabel={applicationMismatch
                ? "Migrating Razorpay application..."
                : connection?.status === "reconnect_required" || connection?.status === "revoked"
                ? "Reconnecting..."
                : "Connecting..."}
            />
          </form>
        ) : null}
        {canDisconnect ? (
          <form action={disconnectRazorpayConnectionAction}>
            <RazorpayActionButton
              className="subtle-link-button danger"
              label="Disconnect Razorpay"
              pendingLabel="Disconnecting..."
            />
          </form>
        ) : null}
      </div>

      <p className="product-manager-note">
        Connecting an account does not enable checkout. Paid payments remain disabled until CloverLoop and Razorpay complete the required setup and approvals.
      </p>
    </section>
  );
}
