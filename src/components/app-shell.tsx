"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calculator, History, Settings2, HardDrive, ArrowUpRight } from "lucide-react";
import { Brand } from "./brand";
import { StudioProvider } from "./studio-provider";
import type { ReactNode } from "react";
export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  return <StudioProvider>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="site-header"><div className="header-inner">
      <Link className="brand-link" href="/" aria-label="FABRIQON Studio home"><Brand /></Link>
      <nav className="main-nav" aria-label="Main navigation">
        {[
          { href: "/", label: "Keychain Calculator", icon: Calculator, active: path === "/" },
          { href: "/history", label: "Calculation History", icon: History, active: path.startsWith("/history") },
          { href: "/settings", label: "Settings", icon: Settings2, active: path === "/settings" },
        ].map(({ href, label, icon: Icon, active }) => <Link key={href} href={href} className={`nav-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}><Icon size={17} strokeWidth={1.7} /><span>{label}</span></Link>)}
      </nav>
      <span className="local-status"><span className="status-dot" /> Local workspace</span>
    </div></header>
    <main id="main-content" className="main-content">{children}</main>
    <footer className="site-footer"><span>© {new Date().getFullYear()} FABRIQON Enterprise<span className="footer-dot">·</span>Built for the details.</span><span><HardDrive size={14} /> Stored on this browser <Link href="/history">Back up your work <ArrowUpRight size={13} /></Link></span></footer>
  </StudioProvider>;
}
