import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Apps Live",
  description: "Local-first broadcast-ready AI applications dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-canvas text-broadcast-text antialiased">
        {children}
      </body>
    </html>
  );
}
