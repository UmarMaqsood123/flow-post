import { NavLink, Outlet } from "react-router";
import { cn } from "@/lib/utils";
import { paths } from "@/routing/paths";
import useCurrentWorkspace from "@/services/workspace/useCurrentWorkspace";

const TABS = [
  { label: "Workspace", to: paths.workspaceSettings, requiresWorkspace: true },
  { label: "Brand profile", to: paths.brandProfile, requiresWorkspace: true },
  { label: "Account", to: paths.accountSettings, requiresWorkspace: false },
];

/** Tabs shared by every settings page. */
function SettingsLayout() {
  const { current } = useCurrentWorkspace();
  const tabs = TABS.filter((tab) => !tab.requiresWorkspace || current);

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Settings" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-1 border-b border-line">
          {tabs.map((tab) => (
            <li key={tab.to}>
              <NavLink
                to={tab.to}
                className={({ isActive }) =>
                  cn(
                    "-mb-px block border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "border-primary text-primary"
                      : "border-transparent text-muted hover:text-ink",
                  )
                }
              >
                {tab.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </div>
  );
}

export default SettingsLayout;
