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

export function RazorpayConnectionCard({
  readiness,
  connection,
  applicationKey,
  creatorEmail,
  statusMessage,
  statusServiceAvailable,
}: {
  readiness: RazorpayOAuthReadiness;
  connection: RazorpayConnectionSummary | null;
  applicationKey: RazorpayApplicationKey | null;
  creatorEmail: string;
  statusMessage: string | undefined;
  statusServiceAvailable: boolean;
}) {
  const currentMessage = statusMessage ? queryMessages[statusMessage] : undefined;
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
  const statusLabel = !statusServiceAvailable
    ? "Status unavailable"
    : tokenIsCurrent
      ? "Connected"
      : connection?.status === "disconnected"
        ? "Disconnected"
        : connection
          ? "Reconnect required"
          : "Not connected";
  const statusTone = tokenIsCurrent
    ? "connected"
    : connection && connection.status !== "disconnected"
      ? "attention"
      : "neutral";

  return (
    <section className="dashboard-card razorpay-connection-card" aria-labelledby="razorpay-connection-title">
      <div className="razorpay-connection-heading">
        <div>
          <span className="dashboard-card-label">Payments setup</span>
          <h2 id="razorpay-connection-title">Razorpay account</h2>
          <p>Manage the Razorpay account connected to your CloverLoop creator account.</p>
        </div>
        <span className={`razorpay-status-badge razorpay-status-${statusTone}`} role="status">
          <span className="razorpay-status-dot" aria-hidden="true" />
          {statusLabel}
        </span>
      </div>

      {currentMessage ? (
        <p className={`dashboard-message dashboard-message-${currentMessage.tone}`} role="status" aria-live="polite">
          {currentMessage.message}
        </p>
      ) : null}

      {!statusServiceAvailable ? (
        <p className="dashboard-message dashboard-message-warning" role="status">
          Connection status could not be checked. Razorpay account services are not configured.
        </p>
      ) : null}

      {connection?.accountId ? (
        <div className="razorpay-account-id">
          <span>Razorpay account ID</span>
          <code>{connection.accountId}</code>
        </div>
      ) : null}

      {applicationMismatch ? (
        <p className="dashboard-message dashboard-message-warning" role="status">
          This connection needs an update. Reconnect Razorpay to continue.
        </p>
      ) : null}

      {!readiness.available ? (
        <p className="product-manager-note">{readiness.message}</p>
      ) : null}

      <div className="razorpay-connection-actions">
        {!tokenIsCurrent ? (
          <form className="razorpay-connect-form" action={startRazorpayConnectionAction}>
            {requiresCommissionConsent ? (
              <div className="razorpay-consent">
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
                <label className="razorpay-consent-checkbox">
                  <input name="commissionConsent" type="checkbox" value="yes" required />
                  {" "}I explicitly accept the additional 4% platform commission, applicable GST, and the applicable platform commission and refund terms.
                </label>
              </div>
            ) : null}
            <div className="razorpay-connect-actions">
              <RazorpayActionButton
                className="button"
                disabled={!readiness.available || !statusServiceAvailable || !applicationKey}
                label={applicationMismatch || connection?.status === "reconnect_required" || connection?.status === "revoked"
                  ? "Reconnect Razorpay"
                  : "Connect Razorpay"}
                pendingLabel={connection && (applicationMismatch || connection.status === "reconnect_required" || connection.status === "revoked")
                  ? "Reconnecting..."
                  : "Connecting..."}
              />
            </div>
          </form>
        ) : null}
        {canDisconnect ? (
          <form className="razorpay-disconnect-form" action={disconnectRazorpayConnectionAction}>
            <RazorpayActionButton
              className="razorpay-disconnect-button"
              label="Disconnect Razorpay"
              pendingLabel="Disconnecting..."
            />
          </form>
        ) : null}
      </div>

    </section>
  );
}
