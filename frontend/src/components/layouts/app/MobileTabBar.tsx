import { Menu } from "lucide-react";
import { Link, useLocation } from "react-router";
import { isNavItemActive, MOBILE_TAB_ITEMS } from "@/config/navigation";
import { cn } from "@/lib/utils";

interface MobileTabBarProps {
  onOpenMenu: () => void;
  menuOpen: boolean;
}

const tabClass =
  "flex w-full flex-col items-center gap-1 px-1 pt-2 pb-1.5 text-[11px] font-medium transition-colors";

/** Bottom navigation on phones and tablets; "More" opens the full drawer. */
function MobileTabBar({ onOpenMenu, menuOpen }: MobileTabBarProps) {
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="Quick navigation"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {MOBILE_TAB_ITEMS.map((item) => {
          const active = isNavItemActive(item, pathname);
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(tabClass, active ? "text-primary" : "text-muted hover:text-ink")}
              >
                <item.icon className="size-5" aria-hidden="true" />
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={onOpenMenu}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            className={cn(tabClass, "text-muted hover:text-ink")}
          >
            <Menu className="size-5" aria-hidden="true" />
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}

export default MobileTabBar;
