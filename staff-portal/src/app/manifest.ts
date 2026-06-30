import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "THE EYE — Command Centre",
    short_name: "EYE Staff",
    description: "Internal staff portal — authorised personnel only",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#07090f",
    theme_color: "#00d4ff",
    orientation: "portrait-primary",
    categories: ["business", "productivity"],
    icons: [
      { src: "/app-icon.png", sizes: "192x192", type: "image/png" },
      { src: "/app-icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
