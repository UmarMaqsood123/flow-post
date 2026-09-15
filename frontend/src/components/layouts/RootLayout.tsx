import { Link, Outlet } from "react-router";
import Logo from "@/components/shared/Logo";
import { buttonStyles } from "@/components/ui/buttonStyles";
import { paths } from "@/routing/paths";
import useSession from "@/services/auth/useSession";

/** Minimal shell for auth pages and email links. Signed-in app pages use AppLayout. */
function RootLayout() {
  const { data: user, isPending } = useSession();

  return (
    <div className="flex min-h-screen flex-col bg-surface text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <Link to={paths.home} aria-label="FlowPost home">
            <Logo />
          </Link>

          {!isPending && (
            <nav className="flex items-center gap-2 text-sm">
              {user ? (
                <Link to={paths.dashboard} className={buttonStyles("primary")}>
                  Go to dashboard
                </Link>
              ) : (
                <>
                  <Link to={paths.login} className={buttonStyles("secondary")}>
                    Log in
                  </Link>
                  <Link to={paths.signup} className={buttonStyles("primary")}>
                    Sign up
                  </Link>
                </>
              )}
            </nav>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <Outlet />
      </main>
    </div>
  );
}

export default RootLayout;
