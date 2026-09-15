import { Outlet } from "react-router";

function AuthLayout() {
  return (
    <div className="flex justify-center py-4 sm:py-10">
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 shadow-sm sm:p-8">
        <Outlet />
      </div>
    </div>
  );
}

export default AuthLayout;
