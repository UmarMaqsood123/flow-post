import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Outlet } from "react-router";
import useDismiss from "@/hooks/useDismiss";
import usePageTitle from "@/hooks/usePageTitle";
import MobileTabBar from "./app/MobileTabBar";
import Navbar from "./app/Navbar";
import Sidebar from "./app/Sidebar";

/** Signed-in application shell: sidebar, header, page content and mobile navigation. */
function AppLayout() {
  usePageTitle();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  useDismiss(drawerRef, sidebarOpen, closeSidebar);

  const openSidebar = () => {
    openerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSidebarOpen(true);
  };

  // While the drawer is open: lock page scroll and move focus into it; restore both on close.
  useEffect(() => {
    if (!sidebarOpen) return;
    const opener = openerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, [sidebarOpen]);

  return (
    <div className="min-h-screen bg-slate-50/50 text-ink">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:shadow"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface lg:flex">
        <Sidebar />
      </aside>

      {/* Mobile drawer */}
      {sidebarOpen && (
        <div
          id="mobile-navigation"
          className="fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
          <div className="absolute inset-0 bg-slate-900/40" aria-hidden="true" />
          <div
            ref={drawerRef}
            className="relative flex h-full w-72 max-w-[85vw] flex-col bg-surface shadow-xl"
          >
            <button
              ref={closeButtonRef}
              type="button"
              onClick={closeSidebar}
              aria-label="Close navigation"
              className="absolute top-3 right-3 z-10 inline-flex size-10 cursor-pointer items-center justify-center rounded-md hover:bg-slate-100"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
            <Sidebar onNavigate={closeSidebar} />
          </div>
        </div>
      )}

      <div className="flex min-h-screen flex-col lg:pl-64">
        <Navbar sidebarOpen={sidebarOpen} onOpenSidebar={openSidebar} />
        <main
          id="main-content"
          className="w-full flex-1 px-4 pt-6 pb-28 sm:px-6 sm:pt-8 lg:px-8 lg:pb-10"
        >
          <div className="mx-auto w-full max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>

      <MobileTabBar menuOpen={sidebarOpen} onOpenMenu={openSidebar} />
    </div>
  );
}

export default AppLayout;
