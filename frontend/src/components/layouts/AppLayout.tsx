import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Outlet } from "react-router";
import useDismiss from "@/hooks/useDismiss";
import usePageTitle from "@/hooks/usePageTitle";
import Navbar from "./app/Navbar";
import Sidebar from "./app/Sidebar";

/** Signed-in application shell: sidebar navigation, top navbar and page content. */
function AppLayout() {
  const title = usePageTitle();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  useDismiss(drawerRef, sidebarOpen, closeSidebar);

  // Prevent the page behind the mobile drawer from scrolling.
  useEffect(() => {
    if (!sidebarOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [sidebarOpen]);

  return (
    <div className="min-h-screen bg-surface text-ink">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:shadow"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-slate-50/60 lg:flex">
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
              type="button"
              onClick={closeSidebar}
              aria-label="Close navigation"
              className="absolute top-3 right-3 z-10 inline-flex size-10 items-center justify-center rounded-md hover:bg-slate-100"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
            <Sidebar onNavigate={closeSidebar} />
          </div>
        </div>
      )}

      <div className="flex min-h-screen flex-col lg:pl-64">
        <Navbar
          title={title}
          sidebarOpen={sidebarOpen}
          onOpenSidebar={() => setSidebarOpen(true)}
        />
        <main id="main-content" className="w-full flex-1 px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export default AppLayout;
