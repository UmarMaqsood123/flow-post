import { Menu } from "lucide-react";
import WorkspaceSwitcher from "@/components/workspace/WorkspaceSwitcher";
import NotificationsMenu from "./NotificationsMenu";
import QuickCreateMenu from "./QuickCreateMenu";
import UserMenu from "./UserMenu";

interface NavbarProps {
  onOpenSidebar: () => void;
  sidebarOpen: boolean;
}

function Navbar({ onOpenSidebar, sidebarOpen }: NavbarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b border-line bg-surface/90 px-4 backdrop-blur sm:gap-3 sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={onOpenSidebar}
        aria-label="Open navigation"
        aria-expanded={sidebarOpen}
        aria-controls="mobile-navigation"
        className="-ml-1.5 inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink hover:bg-slate-100 lg:hidden"
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>

      <WorkspaceSwitcher />

      <div className="flex flex-1 items-center justify-end gap-1 sm:gap-2">
        <QuickCreateMenu />
        <NotificationsMenu />
        <UserMenu />
      </div>
    </header>
  );
}

export default Navbar;
