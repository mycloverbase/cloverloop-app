const internalUrlBase = "https://cloverloop.invalid";

export function safeInternalPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  try {
    const destination = new URL(value, internalUrlBase);
    if (destination.origin !== internalUrlBase) return "/dashboard";
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return "/dashboard";
  }
}
