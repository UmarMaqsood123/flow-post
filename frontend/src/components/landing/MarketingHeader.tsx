import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import Logo from "@/components/shared/Logo";
import { buttonStyles } from "@/components/ui/buttonStyles";
import { navLinks } from "@/config/landing";
import { paths } from "@/routing/paths";
import useSession from "@/services/auth/useSession";
import Container from "./Container";

function MarketingHeader() {
  const { data: user } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  const renderActions = (fullWidth: boolean) =>
    user ? (
      <Link
        to={paths.dashboard}
        onClick={closeMenu}
        className={buttonStyles("primary", fullWidth ? "w-full" : undefined)}
      >
        Go to dashboard
      </Link>
    ) : (
      <>
        <Link
          to={paths.login}
          onClick={closeMenu}
          className={buttonStyles("secondary", fullWidth ? "w-full" : undefined)}
        >
          Log in
        </Link>
        <Link
          to={paths.signup}
          onClick={closeMenu}
          className={buttonStyles("primary", fullWidth ? "w-full" : undefined)}
        >
          Start free
        </Link>
      </>
    );

  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-surface/85 backdrop-blur">
      <Container className="flex h-16 items-center justify-between gap-6">
        <Link to={paths.home} aria-label="FlowPost home" className="rounded-md">
          <Logo />
        </Link>

        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-8 text-sm font-medium text-muted">
            {navLinks.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="transition-colors hover:text-ink">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden items-center gap-2 md:flex">{renderActions(false)}</div>

        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          className="inline-flex size-10 cursor-pointer items-center justify-center rounded-md text-ink hover:bg-slate-100 md:hidden"
        >
          {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </Container>

      {menuOpen && (
        <div id="mobile-menu" className="border-t border-line bg-surface md:hidden">
          <Container className="flex flex-col py-3">
            <nav aria-label="Mobile">
              <ul className="flex flex-col">
                {navLinks.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      onClick={closeMenu}
                      className="block rounded-md px-2 py-2.5 text-sm font-medium hover:bg-slate-50"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="mt-3 flex flex-col gap-2 border-t border-line pt-4 pb-2">
              {renderActions(true)}
            </div>
          </Container>
        </div>
      )}
    </header>
  );
}

export default MarketingHeader;
