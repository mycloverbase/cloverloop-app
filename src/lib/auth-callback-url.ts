export function createAuthCallbackUrl(
  origin: string,
  nextPath: string,
  marketingConsent?: boolean,
): string {
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("next", nextPath);
  if (marketingConsent !== undefined) {
    callback.searchParams.set("marketing_consent", marketingConsent ? "1" : "0");
  }
  return callback.toString();
}
