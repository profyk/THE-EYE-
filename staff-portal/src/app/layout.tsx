import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaInit from "@/components/PwaInit";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f59e0b",
};

export const metadata: Metadata = {
  title: "THE EYE — Command Centre",
  description: "Internal staff portal",
  icons: {
    icon: "/app-icon.png",
    apple: "/app-icon.png",
    shortcut: "/app-icon.png",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "THE EYE",
  },
  formatDetection: { telephone: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="apple-touch-icon" href="/app-icon.png" />
      </head>
      <body className="min-h-screen flex flex-col bg-void text-text antialiased">
        <PwaInit />
        {children}
      </body>
    </html>
  );
}
