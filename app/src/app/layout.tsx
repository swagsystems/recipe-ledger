import type { Metadata } from "next";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import { LedgerShell } from "@/components/ledger";
import { MobileNav } from "@/components/mobile-nav";

export const metadata: Metadata = {
  title: "Recipe Tracker",
  description: "High-protein and high-fiber recipe tracker",
  icons: {
    icon: "/icon.svg"
  }
};

const nav = [
  ["Home", "/"],
  ["Saved", "/saved"],
  ["Search", "/search"],
  ["Review", "/review"],
  ["Sources", "/sources"],
  ["Settings", "/settings"],
  ["Logout", "/logout"]
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="ledger-topbar">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <a href="/" className="flex min-w-0 items-center gap-3">
              <span className="ledger-brand-mark metric">RT</span>
              <span className="min-w-0">
                <span className="ledger-eyebrow block text-herb">Helios</span>
                <span className="block truncate text-xl font-extrabold tracking-normal text-ink">Recipe Tracker</span>
              </span>
            </a>
            {user ? (
              <nav className="hidden flex-wrap items-center gap-2 text-sm sm:flex">
                {nav.map(([label, href]) => (
                  <a
                    key={href}
                    href={href}
                    className="ledger-nav-link"
                  >
                    {label}
                  </a>
                ))}
                <span className="ledger-nav-link max-w-[12rem] truncate text-xs text-ink/60">{user.name}</span>
              </nav>
            ) : null}
          </div>
        </header>
        <main>
          <LedgerShell>{children}</LedgerShell>
        </main>
        {user ? <MobileNav /> : null}
      </body>
    </html>
  );
}
