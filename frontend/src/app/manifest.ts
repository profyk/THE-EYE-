import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "THE EYE",
    short_name: "THE EYE",
    description: "Tamper-proof monitoring, auditing, and accountability platform",
    start_url: "/overview",
    display: "standalone",
    background_color: "#07090f",
    theme_color: "#00d4ff",
    orientation: "portrait-primary",
    categories: ["security", "productivity", "business"],
    icons: [
      { src: "/app-icon.png", sizes: "192x192", type: "image/png" },
      { src: "/app-icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
