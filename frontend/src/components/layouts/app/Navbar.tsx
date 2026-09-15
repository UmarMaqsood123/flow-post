import { Menu } from "lucide-react";
import UserMenu from "./UserMenu";

interface NavbarProps {
  title?: string;
  onOpenSidebar: () => void;
  sidebarOpen: boolean;
}

function Navbar({ title, onOpenSidebar, sidebarOpen }: NavbarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={onOpenSidebar}
        aria-label="Open navigation"
        aria-expanded={sidebarOpen}
        aria-controls="mobile-navigation"
        className="-ml-1.5 inline-flex size-10 items-center justify-center rounded-md text-ink hover:bg-slate-100 lg:hidden"
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>

      <p className="min-w-0 flex-1 truncate text-base font-semibold">{title}</p>

      <UserMenu />
    </header>
  );
}

export default Navbar;
