import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Proxy all /v1/* API calls to the backend server-side.
  // This avoids CORS entirely and means the session cookie lives on the
  // Vercel domain — no NEXT_PUBLIC_ env var needed in the client bundle.
  async rewrites() {
    const apiBase = process.env.API_BASE_URL ?? "http://localhost:8000";
    return [
      {
        source: "/v1/:path*",
        destination: `${apiBase}/v1/:path*`,
      },
    ];
  },
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
