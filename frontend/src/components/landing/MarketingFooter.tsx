import { Link } from "react-router";
import Logo from "@/components/shared/Logo";
import { env } from "@/config/env";
import { navLinks } from "@/config/landing";
import { paths } from "@/routing/paths";
import Container from "./Container";

const companyLinks = [
  { label: "About", to: paths.about },
  { label: "Contact us", to: paths.contact },
];

const legalLinks = [
  { label: "Terms & Conditions", to: paths.terms },
  { label: "Privacy Policy", to: paths.privacy },
];

const linkClass = "text-sm text-muted transition-colors hover:text-ink";

function MarketingFooter() {
  return (
    <footer className="border-t border-line">
      <Container className="grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-4 text-sm text-muted">
            The AI social media manager that turns ideas into scheduled posts.
          </p>
        </div>

        <nav aria-labelledby="footer-product">
          <h2 id="footer-product" className="text-sm font-semibold">
            Product
          </h2>
          <ul className="mt-4 flex flex-col gap-3">
            {navLinks.map((link) => (
              <li key={link.href}>
                <a href={link.href} className={linkClass}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-labelledby="footer-account">
          <h2 id="footer-account" className="text-sm font-semibold">
            Account
          </h2>
          <ul className="mt-4 flex flex-col gap-3">
            <li>
              <Link to={paths.login} className={linkClass}>
                Log in
              </Link>
            </li>
            <li>
              <Link to={paths.signup} className={linkClass}>
                Sign up
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-labelledby="footer-company">
          <h2 id="footer-company" className="text-sm font-semibold">
            Company
          </h2>
          <ul className="mt-4 flex flex-col gap-3">
            {companyLinks.map((link) => (
              <li key={link.to}>
                <Link to={link.to} className={linkClass}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Container>

      <div className="border-t border-line">
        <Container className="flex flex-col gap-3 py-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">
            © {new Date().getFullYear()} {env.appName}. All rights reserved.
          </p>
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {legalLinks.map((link) => (
              <li key={link.to}>
                <Link to={link.to} className={linkClass}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </div>
    </footer>
  );
}

export default MarketingFooter;
