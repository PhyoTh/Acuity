import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DevLens",
  description: "Live technical interviews with an AI assistant + recruiter telemetry.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
