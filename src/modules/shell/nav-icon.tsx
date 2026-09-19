import {
  BarChart3,
  Boxes,
  ClipboardList,
  HandCoins,
  History,
  LayoutDashboard,
  Package,
  Receipt,
  ReceiptText,
  Settings,
  ShoppingCart,
  Store,
  CreditCard,
  Truck,
  UserCog,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

/**
 * Explicit icon registry rather than a dynamic import: it keeps the navigation
 * config plain data (serialisable, testable) while still tree-shaking to only
 * the icons the app actually uses.
 */
const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  ShoppingCart,
  ReceiptText,
  Package,
  Boxes,
  ClipboardList,
  Truck,
  Users,
  UserPlus,
  HandCoins,
  Receipt,
  Wallet,
  UserCog,
  BarChart3,
  Settings,
  History,
  Store,
  CreditCard,
};

export function NavIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? LayoutDashboard;
  return <Icon className={className} aria-hidden="true" />;
}
