import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "THE EYE — Command Centre",
  description: "Internal staff portal",
  icons: {
    icon: "/app-icon.png",
    apple: "/app-icon.png",
    shortcut: "/app-icon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen flex flex-col bg-void text-text antialiased">
        {children}
      </body>
    </html>
  );
}
