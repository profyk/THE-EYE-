import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/dashboard",
    name: "THE EYE — Command Centre",
    short_name: "EYE Staff",
    description: "Internal staff portal — authorised personnel only",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    background_color: "#04070b",
    theme_color: "#f59e0b",
    orientation: "portrait-primary",
    categories: ["business", "productivity"],
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
