import { ChevronDown, Layers, LogOut, UserRound } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Link } from "react-router";
import useDismiss from "@/hooks/useDismiss";
import { paths } from "@/routing/paths";
import useLogout from "@/services/auth/useLogout";
import useSession from "@/services/auth/useSession";

const itemClass =
  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-60";

const initialsFor = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("") || "U";

function UserMenu() {
  const { data: user } = useSession();
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(containerRef, open, close);

  if (!user) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((isOpen) => !isOpen)}
        aria-expanded={open}
        aria-controls="user-menu-panel"
        aria-label={`Account menu for ${user.name}`}
        className="flex items-center gap-2 rounded-full p-1 hover:bg-slate-100 sm:pr-2.5"
      >
        <span
          aria-hidden="true"
          className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white"
        >
          {initialsFor(user.name)}
        </span>
        <span className="hidden max-w-36 truncate text-sm font-medium sm:block">{user.name}</span>
        <ChevronDown className="hidden size-4 text-muted sm:block" aria-hidden="true" />
      </button>

      {open && (
        <div
          id="user-menu-panel"
          className="absolute right-0 z-50 mt-2 w-64 rounded-lg border border-line bg-surface p-1.5 shadow-lg"
        >
          <div className="border-b border-line px-2.5 pt-1.5 pb-2.5">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
          <div className="py-1">
            <Link to={paths.accountSettings} onClick={close} className={itemClass}>
              <UserRound className="size-4 text-muted" aria-hidden="true" />
              Account settings
            </Link>
            <Link to={paths.workspaces} onClick={close} className={itemClass}>
              <Layers className="size-4 text-muted" aria-hidden="true" />
              Workspaces
            </Link>
          </div>
          <div className="border-t border-line pt-1">
            <button
              type="button"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
              className={itemClass}
            >
              <LogOut className="size-4 text-muted" aria-hidden="true" />
              {logout.isPending ? "Logging out…" : "Log out"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default UserMenu;
