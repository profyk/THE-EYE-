import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Pin the workspace root explicitly -- Turbopack's root inference walks up
  // parent directories looking for lockfiles and can land on an unrelated one
  // (e.g. elsewhere under the user's home directory), which breaks the build.
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Content-Security-Policy moved to middleware.ts -- it needs a fresh nonce
  // per request (for Next's own inline hydration scripts), which a static
  // header here can't provide.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Opt out of every browser feature the dashboard doesn't use.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
          },
          // Prevent sharing a browsing-context group with cross-origin pages
          // (closes Spectre side-channel vectors against the dashboard).
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          // Prevent cross-origin pages from embedding our assets.
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
