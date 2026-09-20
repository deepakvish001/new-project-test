import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bakaya — Collections",
  description: "WhatsApp-native collections for Indian MSME manufacturers",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
