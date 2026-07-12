import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ofora Agents",
  description: "Paid A2A procurement integrity agents powered by CROO CAP."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
