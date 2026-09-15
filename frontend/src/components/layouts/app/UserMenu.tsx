import { ChevronDown, CreditCard, Layers, LogOut, Settings, UserRound } from "lucide-react";
import { Link } from "react-router";
import Popover from "@/components/ui/Popover";
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

const LINKS = [
  { label: "Account settings", to: paths.accountSettings, icon: UserRound },
  { label: "Workspace settings", to: paths.workspaceSettings, icon: Settings },
  { label: "All workspaces", to: paths.workspaces, icon: Layers },
  { label: "Billing", to: paths.billing, icon: CreditCard },
];

function UserMenu() {
  const { data: user } = useSession();
  const logout = useLogout();

  if (!user) return null;

  return (
    <Popover
      label={`Account menu for ${user.name}`}
      buttonClassName="flex items-center gap-2 rounded-full p-1 hover:bg-slate-100 md:pr-2.5"
      buttonContent={
        <>
          <span
            aria-hidden="true"
            className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white"
          >
            {initialsFor(user.name)}
          </span>
          <span className="hidden max-w-36 truncate text-sm font-medium md:block">{user.name}</span>
          <ChevronDown className="hidden size-4 text-muted md:block" aria-hidden="true" />
        </>
      }
      panelClassName="w-64 p-1.5"
    >
      {(close) => (
        <>
          <div className="border-b border-line px-2.5 pt-1.5 pb-2.5">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
          <div className="py-1">
            {LINKS.map(({ label, to, icon: Icon }) => (
              <Link key={to} to={to} onClick={close} className={itemClass}>
                <Icon className="size-4 text-muted" aria-hidden="true" />
                {label}
              </Link>
            ))}
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
        </>
      )}
    </Popover>
  );
}

export default UserMenu;
