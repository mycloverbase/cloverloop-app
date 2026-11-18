import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

export type RazorpayOAuthEnvironment = "test" | "live";
export type RazorpayApplicationKey = "ZERO_FEE" | "FOUR_PERCENT";
export type RazorpayTokenHint = "access_token" | "refresh_token";

export type RazorpayOAuthConfig = {
  applicationKey: RazorpayApplicationKey;
  applicationId: string;
  clientId: string;
  clientSecret: string;
  environment: RazorpayOAuthEnvironment;
  redirectUri: string;
};

export type RazorpayOAuthTokens = {
  accessToken: string;
  refreshToken: string;
  publicToken: string;
  expiresInSeconds: number;
  accountId: string | null;
};

export type RazorpayOAuthReadiness =
  | { available: true; environment: RazorpayOAuthEnvironment }
  | { available: false; message: string };

export class RazorpayOAuthError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "RazorpayOAuthError";
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function encryptionKey(): Buffer {
  const encoded = process.env.RAZORPAY_TOKEN_ENCRYPTION_KEY?.trim();
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error("Razorpay token encryption is not configured.");
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, "")) {
    throw new Error("RAZORPAY_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
  return key;
}

export function getRazorpayOAuthMode(): RazorpayOAuthEnvironment | null {
  const mode = process.env.RAZORPAY_OAUTH_MODE?.trim();
  return mode === "test" || mode === "live" ? mode : null;
}

function credentials(): {
  clientId: string | null;
  clientSecret: string | null;
} {
  return applicationCredentials("ZERO_FEE", getRazorpayOAuthMode());
}

function applicationCredentials(
  applicationKey: RazorpayApplicationKey,
  environment: RazorpayOAuthEnvironment | null,
): { clientId: string | null; clientSecret: string | null } {
  if (!environment) return { clientId: null, clientSecret: null };
  const prefix = `RAZORPAY_${applicationKey}`;
  const mode = environment.toUpperCase();
  const read = (suffix: "CLIENT_ID" | "CLIENT_SECRET") =>
    process.env[`${prefix}_${mode}_${suffix}`]?.trim() ||
    process.env[`${prefix}_${suffix}`]?.trim() ||
    (applicationKey === "ZERO_FEE"
      ? process.env[`RAZORPAY_OAUTH_${mode}_${suffix}`]?.trim() ||
        process.env[`RAZORPAY_OAUTH_${suffix}`]?.trim()
      : "") ||
    null;
  return { clientId: read("CLIENT_ID"), clientSecret: read("CLIENT_SECRET") };
}

function siteOrigin(): string | null {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function getRazorpayOAuthReadiness(
  requestedEnvironment = getRazorpayOAuthMode(),
): RazorpayOAuthReadiness {
  return getRazorpayApplicationReadiness("ZERO_FEE", requestedEnvironment);
}

export function getRazorpayApplicationReadiness(
  applicationKey: RazorpayApplicationKey,
  requestedEnvironment = getRazorpayOAuthMode(),
): RazorpayOAuthReadiness {
  const environment = requestedEnvironment;
  const configuredCredentials = applicationCredentials(applicationKey, environment);
  const origin = siteOrigin();
  if (
    !environment ||
    !configuredCredentials.clientId ||
    !configuredCredentials.clientSecret ||
    !origin
  ) {
    return {
      available: false,
      message: "Razorpay OAuth client, mode and site URL must be configured by the server.",
    };
  }
  if (environment === "live" && !origin.startsWith("https://")) {
    return {
      available: false,
      message: "Live Razorpay OAuth requires an HTTPS site URL.",
    };
  }
  try {
    encryptionKey();
  } catch {
    return {
      available: false,
      message: "Razorpay token encryption must be configured by the server.",
    };
  }
  return { available: true, environment };
}

export function getRazorpayOAuthConfig(
  environment = getRazorpayOAuthMode(),
): RazorpayOAuthConfig | null {
  return getRazorpayApplicationConfig("ZERO_FEE", environment);
}

export function getRazorpayApplicationConfig(
  applicationKey: RazorpayApplicationKey,
  environment = getRazorpayOAuthMode(),
): RazorpayOAuthConfig | null {
  const readiness = getRazorpayApplicationReadiness(applicationKey, environment);
  if (!readiness.available) return null;
  const origin = siteOrigin();
  const { clientId, clientSecret } = applicationCredentials(applicationKey, environment);
  if (!origin || !clientId || !clientSecret) return null;
  return {
    applicationKey,
    applicationId: clientId,
    clientId,
    clientSecret,
    environment: readiness.environment,
    redirectUri: `${origin}/api/razorpay/callback`,
  };
}

export function selectRazorpayApplication(
  plan: unknown,
  commissionPercentage: unknown,
  foundingProgrammeStatus: unknown,
): RazorpayApplicationKey | null {
  if (typeof commissionPercentage !== "number") return null;
  if (plan === "free" || plan === "pro_creator") {
    return commissionPercentage === 0 ? "ZERO_FEE" : null;
  }
  if (plan === "founding_creator") {
    return commissionPercentage === 0 ? "ZERO_FEE" : null;
  }
  if (plan !== "creator") return null;
  if (commissionPercentage === 4 && foundingProgrammeStatus !== "active") {
    return "FOUR_PERCENT";
  }
  if (commissionPercentage === 0 && foundingProgrammeStatus === "active") {
    return "ZERO_FEE";
  }
  return null;
}

export function createRazorpayOAuthState(): { state: string; stateHash: string } {
  const state = randomBytes(32).toString("base64url");
  return { state, stateHash: createHash("sha256").update(state).digest("hex") };
}

export function hashRazorpayOAuthState(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

export function isRazorpayConnectionUsable(
  status: string,
  tokenExpiresAt: string | null,
  now = Date.now(),
): boolean {
  if (status !== "connected" || !tokenExpiresAt) return false;
  const expiry = new Date(tokenExpiresAt).getTime();
  return Number.isFinite(expiry) && expiry > now;
}

export function encryptRazorpayToken(
  token: string,
  creatorId: string,
  purpose: "access" | "refresh",
  environment: RazorpayOAuthEnvironment = "test",
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`cloverloop-razorpay:${creatorId}:${environment}:${purpose}:v2`));
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [
    "v2",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptRazorpayToken(
  value: string,
  creatorId: string,
  purpose: "access" | "refresh",
  environment: RazorpayOAuthEnvironment = "test",
): string {
  const [version, ivValue, tagValue, encryptedValue, extra] = value.split(".");
  if (
    (version !== "v1" && version !== "v2") ||
    !ivValue ||
    !tagValue ||
    !encryptedValue ||
    extra !== undefined ||
    (version === "v1" && environment !== "test")
  ) {
    throw new Error("Stored Razorpay token ciphertext is malformed.");
  }
  const iv = Buffer.from(ivValue, "base64url");
  const tag = Buffer.from(tagValue, "base64url");
  if (iv.length !== 12 || tag.length !== 16) {
    throw new Error("Stored Razorpay token ciphertext is malformed.");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAAD(Buffer.from(
    version === "v1"
      ? `cloverloop-razorpay:${creatorId}:${purpose}:v1`
      : `cloverloop-razorpay:${creatorId}:${environment}:${purpose}:v2`,
  ));
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function parseTokenResponse(payload: unknown, status: number): RazorpayOAuthTokens {
  const expiresIn = isRecord(payload) ? Number(payload.expires_in) : Number.NaN;
  if (
    !isRecord(payload) ||
    payload.token_type !== "Bearer" ||
    typeof payload.access_token !== "string" ||
    !payload.access_token ||
    typeof payload.refresh_token !== "string" ||
    !payload.refresh_token ||
    typeof payload.public_token !== "string" ||
    !payload.public_token ||
    !Number.isSafeInteger(expiresIn) ||
    expiresIn <= 0 ||
    (payload.razorpay_account_id !== undefined &&
      typeof payload.razorpay_account_id !== "string")
  ) {
    throw new RazorpayOAuthError(status, "Razorpay returned an invalid OAuth token response.");
  }
  const accountId = payload.razorpay_account_id;
  if (typeof accountId === "string" && !/^acc_[A-Za-z0-9]+$/.test(accountId)) {
    throw new RazorpayOAuthError(status, "Razorpay returned an invalid merchant account identifier.");
  }
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    publicToken: payload.public_token,
    expiresInSeconds: expiresIn,
    accountId: typeof accountId === "string" ? accountId : null,
  };
}

async function postTokenRequest(
  body: Record<string, string>,
): Promise<{ payload: unknown; status: number }> {
  const response = await fetch("https://auth.razorpay.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new RazorpayOAuthError(response.status, "Razorpay rejected the OAuth token request.");
  }
  return { payload, status: response.status };
}

export async function exchangeRazorpayAuthorizationCode(
  code: string,
  config: RazorpayOAuthConfig,
): Promise<RazorpayOAuthTokens> {
  const { payload, status } = await postTokenRequest({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
    code,
    mode: config.environment,
  });
  const tokens = parseTokenResponse(payload, status);
  if (!tokens.accountId) {
    throw new RazorpayOAuthError(502, "Razorpay did not return a merchant account identifier.");
  }
  return tokens;
}

export async function refreshRazorpayTokenPair(
  refreshToken: string,
  config: Pick<RazorpayOAuthConfig, "clientId" | "clientSecret">,
): Promise<RazorpayOAuthTokens> {
  const { payload, status } = await postTokenRequest({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  return parseTokenResponse(payload, status);
}

export async function revokeRazorpayToken(
  token: string,
  tokenTypeHint: RazorpayTokenHint,
  config: Pick<RazorpayOAuthConfig, "clientId" | "clientSecret">,
): Promise<void> {
  const response = await fetch("https://auth.razorpay.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      token_type_hint: tokenTypeHint,
      token,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new RazorpayOAuthError(response.status, "Razorpay rejected the token revocation request.");
  }
}
