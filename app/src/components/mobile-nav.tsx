"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { label: "Home", href: "/", icon: "⌂" },
  { label: "Saved", href: "/saved", icon: "♡" },
  { label: "Search", href: "/search", icon: "⌕" },
  { label: "Settings", href: "/settings", icon: "⚙" }
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="ledger-mobile-nav">
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} className={active ? "active" : undefined}>
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
