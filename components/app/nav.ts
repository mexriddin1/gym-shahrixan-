import {
  ChartBarIcon,
  ClockCountdownIcon,
  MoneyIcon,
  TableIcon,
  UsersIcon,
  WalletIcon,
  GearIcon,
} from "@phosphor-icons/react/dist/ssr";
// Type-only, so it is erased at build and pulls in no client runtime.
import type { Icon } from "@phosphor-icons/react";

export type NavItem = {
  label: string;
  href: string;
  icon: Icon;
};

/**
 * Six working screens plus settings.
 *
 * Deliberately flat: at seven items a grouped sidebar is scaffolding around
 * nothing. Orders and stock movements were folded into the daily sheet, where
 * the desk already records what a member bought; tariffs, the worker list and
 * the PIN live in settings because they are configured once and then left
 * alone.
 *
 * Avans sits after the money screens and before the report, which is where it
 * falls in the day: takings first, what went back out second, the summary of
 * both last.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: "Kunlik hisob", href: "/kunlik", icon: TableIcon },
  { label: "Mijozlar", href: "/mijozlar", icon: UsersIcon },
  { label: "Obunalar", href: "/obunalar", icon: ClockCountdownIcon },
  { label: "Oylik", href: "/oylik", icon: WalletIcon },
  { label: "Avans", href: "/avans", icon: MoneyIcon },
  { label: "Hisobot", href: "/hisobot", icon: ChartBarIcon },
  { label: "Sozlamalar", href: "/sozlamalar", icon: GearIcon },
];

export function findNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}
