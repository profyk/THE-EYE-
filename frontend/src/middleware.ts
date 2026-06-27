import { NextRequest, NextResponse } from "next/server";

// CSP is nonce-based, not 'unsafe-inline', so Next.js's own per-request inline
// hydration/RSC-payload scripts (and our theme-flash script in layout.tsx) are
// allowlisted without opening the door to arbitrary injected <script> tags.
// 'strict-dynamic' lets those nonced scripts load further same-origin scripts
// without each one needing its own nonce.
const API_ORIGIN = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `connect-src 'self' ${API_ORIGIN}`,
    "img-src 'self' data:",
    // 'unsafe-inline' for styles is a known Next.js limitation: inline style
    // attributes are used throughout React for dynamic values and cannot be
    // replaced with nonces on a per-style basis without invasive changes.
    // Mitigated by the strict script-src (no inline JS without a nonce) and
    // frame-ancestors/CORP headers blocking cross-origin loading.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    // Disallow plugins (Flash, etc) and object/embed tags entirely.
    "object-src 'none'",
    // Prevent <base> tag injection from redirecting relative URLs.
    "base-uri 'self'",
    // Restrict where forms can submit to -- prevents data exfil via hidden forms.
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
