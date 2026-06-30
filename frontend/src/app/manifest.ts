import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "THE EYE",
    short_name: "THE EYE",
    description: "Tamper-proof monitoring, auditing, and accountability platform",
    start_url: "/overview",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    background_color: "#07090f",
    theme_color: "#00d4ff",
    orientation: "portrait-primary",
    categories: ["security", "productivity", "business"],
    icons: [
      { src: "/app-icon.png", sizes: "72x72",   type: "image/png" },
      { src: "/app-icon.png", sizes: "96x96",   type: "image/png" },
      { src: "/app-icon.png", sizes: "128x128", type: "image/png" },
      { src: "/app-icon.png", sizes: "144x144", type: "image/png" },
      { src: "/app-icon.png", sizes: "152x152", type: "image/png" },
      { src: "/app-icon.png", sizes: "180x180", type: "image/png" },
      { src: "/app-icon.png", sizes: "192x192", type: "image/png" },
      { src: "/app-icon.png", sizes: "384x384", type: "image/png" },
      { src: "/app-icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
