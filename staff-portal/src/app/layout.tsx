import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "THE EYE — Command Centre",
  description: "Internal staff portal",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-void text-text antialiased">
        {children}
      </body>
    </html>
  );
}
