import { Outlet } from "react-router";
import MarketingFooter from "@/components/landing/MarketingFooter";
import MarketingHeader from "@/components/landing/MarketingHeader";

/** Full-bleed layout for public marketing pages (the app uses RootLayout). */
function MarketingLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-surface text-ink">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:shadow"
      >
        Skip to content
      </a>
      <MarketingHeader />
      <main id="main-content" className="flex-1">
        <Outlet />
      </main>
      <MarketingFooter />
    </div>
  );
}

export default MarketingLayout;
