"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ActivityIcon,
  CalendarIcon,
  CardIcon,
  DashboardIcon,
  GraduateIcon,
  MailIcon,
  UsersIcon,
} from "./icons";

const NAV = [
  { href: "/admin", label: "Dashboard", Icon: DashboardIcon },
  { href: "/admin/families", label: "Families", Icon: UsersIcon },
  { href: "/admin/schedule", label: "Schedule", Icon: CalendarIcon },
  { href: "/admin/billing", label: "Billing", Icon: CardIcon },
  { href: "/admin/emails", label: "Emails", Icon: MailIcon },
  { href: "/admin/jobs", label: "Jobs", Icon: ActivityIcon },
];

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

export function AdminSidebar() {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col">
      <Link href="/admin" className="flex items-center gap-2.5 px-2 py-1">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <GraduateIcon width={20} height={20} />
        </span>
        <span className="leading-tight">
          <span className="block text-sm font-semibold">Miss Loh</span>
          <span className="block text-xs text-muted-foreground">Tutoring Admin</span>
        </span>
      </Link>

      <nav className="mt-8 flex flex-1 flex-col gap-1">
        {NAV.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-primary-soft text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon width={18} height={18} />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function AdminMobileNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto pb-1">
      {NAV.map(({ href, label, Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-primary-soft text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Icon width={16} height={16} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
