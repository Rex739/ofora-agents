import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ofora Agents",
  description: "Paid agent-to-agent coordination for confidential procurement award validation."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
