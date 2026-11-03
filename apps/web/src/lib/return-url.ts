/**
 * Validate a return URL is safe (internal only, no protocol-relative or external).
 * Rejects anything that isn't a relative path starting with "/".
 */
export function getSafeReturnUrl(url: string | null | undefined): string {
  if (!url) return "/";

  // Reject anything that doesn't start with /
  if (!url.startsWith("/")) return "/";

  // Reject protocol-relative URLs (//evil.com)
  if (url.startsWith("//")) return "/";

  // Reject URLs with schemes (/javascript:... or similar)
  if (url.includes(":")) {
    // Allow only if the colon is in a query param value, not a scheme
    const pathPart = url.split("?")[0]!;
    if (pathPart.includes(":")) return "/";
  }

  return url;
}
