import { Outlet } from "react-router";

/** Bare shell for auth pages and email links. Signed-in app pages use AppLayout. */
function RootLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-surface text-ink">
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <Outlet />
      </main>
    </div>
  );
}

export default RootLayout;
