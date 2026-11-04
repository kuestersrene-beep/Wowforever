"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
}

// Hauptnavigation im Seitenkopf. Client Component nur wegen usePathname,
// damit der aktuelle Bereich markiert ist (auch auf Unterseiten wie
// /termine/123).
export default function NavLinks({ items, label }: { items: NavItem[]; label: string }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    // Auf dem Handy eine waagrecht wischbare Leiste statt mehrerer umbrechender Zeilen
    <nav
      aria-label={label}
      className="-mx-4 flex gap-x-5 overflow-x-auto whitespace-nowrap px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 lg:gap-x-5 [&::-webkit-scrollbar]:hidden"
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(item.href) ? "page" : undefined}
          className={`border-b-2 py-2.5 transition ${
            isActive(item.href)
              ? "border-gold font-semibold text-parchment"
              : "border-transparent text-muted hover:text-parchment"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
