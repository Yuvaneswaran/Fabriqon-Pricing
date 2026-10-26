import type { Metadata } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
export const metadata: Metadata = {
  title: { default: "FABRIQON Studio — Precision Keychain Pricing", template: "%s | FABRIQON Studio" },
  description: "Precision pricing for custom 3D printing. Calculate keychain costs, save pricing snapshots, and manage your local calculation history.",
  applicationName: "FABRIQON Studio",
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-MY"><body><AppShell>{children}</AppShell></body></html>;
}
