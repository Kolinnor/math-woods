"use client";

import type { Route } from "next";
import Link from "next/link";
import { BookOpen, House, ListChecks, Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type MobileBottomNavigationProps = {
  labels: {
    home: string;
    problems: string;
    concepts: string;
    menu: string;
  };
};

export function MobileBottomNavigation({ labels }: MobileBottomNavigationProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const focusedRoute =
    /^\/problems\/[^/]+(?:\/|$)/.test(pathname) ||
    /\/(?:new|edit|translate)$/.test(pathname) ||
    pathname.startsWith("/chat/");

  useEffect(() => {
    const menu = document.getElementById("site-navigation-menu");
    if (!(menu instanceof HTMLDetailsElement)) return;
    const update = () => setMenuOpen(menu.open);
    menu.addEventListener("toggle", update);
    update();
    return () => menu.removeEventListener("toggle", update);
  }, []);

  useEffect(() => {
    const menu = document.getElementById("site-navigation-menu");
    if (menu instanceof HTMLDetailsElement) menu.open = false;
  }, [pathname]);

  function openMenu() {
    const menu = document.getElementById("site-navigation-menu");
    if (!(menu instanceof HTMLDetailsElement)) return;
    menu.open = true;
    window.setTimeout(() => menu.querySelector<HTMLElement>(".nav-menu-popover a, .nav-menu-popover button")?.focus(), 0);
  }

  const items = [
    { href: "/" as Route, label: labels.home, icon: House, active: pathname === "/" },
    { href: "/problems" as Route, label: labels.problems, icon: ListChecks, active: pathname.startsWith("/problems") },
    { href: "/concepts" as Route, label: labels.concepts, icon: BookOpen, active: pathname.startsWith("/concepts") }
  ];

  return (
    <nav className={`mobile-bottom-nav${focusedRoute ? " mobile-bottom-nav-hidden" : ""}`} aria-label={labels.menu}>
      {items.map(({ href, label, icon: Icon, active }) => (
        <Link key={href} href={href} aria-current={active ? "page" : undefined}>
          <Icon size={21} strokeWidth={active ? 2.35 : 1.9} aria-hidden="true" />
          <span>{label}</span>
        </Link>
      ))}
      <button type="button" onClick={openMenu} aria-controls="site-navigation-menu" aria-expanded={menuOpen}>
        <Menu size={21} aria-hidden="true" />
        <span>{labels.menu}</span>
      </button>
    </nav>
  );
}
