import {
  disconnectRazorpayConnectionAction,
  startRazorpayConnectionAction,
} from "@/app/dashboard/razorpay/actions";
import {
  isRazorpayConnectionUsable,
  type RazorpayOAuthEnvironment,
  type RazorpayOAuthReadiness,
} from "@/lib/razorpay/oauth";
import { RazorpayActionButton } from "@/components/dashboard/razorpay-action-button";

type RazorpayConnectionSummary = {
  accountId: string;
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
  statusMessage,
  statusServiceAvailable,
}: {
  readiness: RazorpayOAuthReadiness;
  connection: RazorpayConnectionSummary | null;
  statusMessage: string | undefined;
  statusServiceAvailable: boolean;
}) {
  const currentMessage = statusMessage ? queryMessages[statusMessage] : undefined;
  const tokenExpiry = formattedDate(connection?.tokenExpiresAt ?? null);
  const lastRefresh = formattedDate(connection?.lastRefreshedAt ?? null);
  const tokenIsCurrent = connection
    ? isRazorpayConnectionUsable(connection.status, connection.tokenExpiresAt)
    : false;
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
          <p><strong>Environment:</strong> {connection.environment === "test" ? "Test" : "Production"}</p>
          {tokenExpiry ? <p><strong>Access token expires:</strong> {tokenExpiry}</p> : null}
          {lastRefresh ? <p><strong>Last token refresh:</strong> {lastRefresh}</p> : null}
        </div>
      ) : (
        <p><strong>Status:</strong> Not connected</p>
      )}

      {!readiness.available ? (
        <p className="product-manager-note">{readiness.message}</p>
      ) : null}

      <div className="dashboard-form-actions">
        {!tokenIsCurrent ? (
          <form action={startRazorpayConnectionAction}>
            <RazorpayActionButton
              className="button"
              disabled={!readiness.available || !statusServiceAvailable}
              label={connection?.status === "reconnect_required" || connection?.status === "revoked"
                ? "Reconnect Razorpay"
                : "Connect Razorpay"}
              pendingLabel={connection?.status === "reconnect_required" || connection?.status === "revoked"
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
