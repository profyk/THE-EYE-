import type { Metadata, Viewport } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import PwaInit from "@/components/PwaInit";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#00d4ff",
};

export const metadata: Metadata = {
  title: "THE EYE",
  description: "Tamper-proof monitoring, auditing, and accountability platform",
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

// Runs before React hydrates, directly setting the class on <html> from
// localStorage (or system preference) so there's no flash of the wrong
// theme on load -- the same pattern next-themes uses. Safe because it
// happens before hydration reconciliation starts, not during it.
const NO_FLASH_THEME_SCRIPT = `
(function () {
  try {
    var stored = window.localStorage.getItem("the_eye_theme");
    var theme = stored === "light" || stored === "dark"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    if (theme === "dark") document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="apple-touch-icon" href="/app-icon.png" />
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-void text-text">
        <PwaInit />
        {children}
      </body>
    </html>
  );
}
