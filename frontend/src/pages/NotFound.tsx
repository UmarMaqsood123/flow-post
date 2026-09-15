import { Link } from "react-router";
import { paths } from "@/routing/paths";

function NotFound() {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      <p className="text-sm font-medium text-primary">404</p>
      <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
      <Link to={paths.home} className="text-sm font-medium text-primary hover:underline">
        Back to home
      </Link>
    </div>
  );
}

export default NotFound;
