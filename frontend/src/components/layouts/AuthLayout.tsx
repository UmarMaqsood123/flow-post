import { Link, Outlet } from "react-router";
import Logo from "@/components/shared/Logo";
import { paths } from "@/routing/paths";

function AuthLayout() {
  return (
    <div className="flex justify-center py-4 sm:py-10">
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 shadow-sm sm:p-8">
        <Link to={paths.home} aria-label="FlowPost home" className="mb-6 inline-flex">
          <Logo />
        </Link>
        <Outlet />
      </div>
    </div>
  );
}

export default AuthLayout;
