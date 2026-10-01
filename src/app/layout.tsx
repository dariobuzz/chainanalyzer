import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { config } from "@/lib/config";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter, DemoBanner } from "@/components/layout/app-footer";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "ChainScope – Crypto AML & Wallet Intelligence", template: "%s · ChainScope" },
  description: "Blockchain intelligence for AML, compliance and digital asset due diligence.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const mode = config.demoMode ? "demo" : "live";
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans">
        {mode === "demo" ? <DemoBanner /> : null}
        <AppHeader mode={mode} />
        <main>{children}</main>
        <AppFooter />
      </body>
    </html>
  );
}
