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
    "style-src 'self' 'unsafe-inline'",
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
