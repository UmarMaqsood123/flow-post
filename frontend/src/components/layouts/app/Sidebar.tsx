import { Link, NavLink } from "react-router";
import Logo from "@/components/shared/Logo";
import WorkspaceSwitcher from "@/components/workspace/WorkspaceSwitcher";
import { NAV_SECTIONS } from "@/config/navigation";
import { cn } from "@/lib/utils";
import { paths } from "@/routing/paths";
import useCurrentWorkspace from "@/services/workspace/useCurrentWorkspace";

interface SidebarProps {
  /** Called after a navigation link is clicked (closes the mobile drawer). */
  onNavigate?: () => void;
}

function Sidebar({ onNavigate }: SidebarProps) {
  const { current } = useCurrentWorkspace();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-16 shrink-0 items-center px-5">
        <Link to={paths.dashboard} onClick={onNavigate} aria-label="FlowPost dashboard">
          <Logo />
        </Link>
      </div>

      <div className="shrink-0 px-3 pb-2">
        <WorkspaceSwitcher fullWidth />
      </div>

      <nav aria-label="Main" className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
        {NAV_SECTIONS.map((section) => {
          const items = section.items.filter((item) => !item.requiresWorkspace || current);
          if (items.length === 0) return null;

          return (
            <div key={section.title} className="mt-5">
              <p className="px-3 text-xs font-semibold tracking-wide text-muted uppercase">
                {section.title}
              </p>
              <ul className="mt-1.5 flex flex-col gap-0.5">
                {items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === paths.dashboard}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-slate-600 hover:bg-slate-100 hover:text-ink",
                        )
                      }
                    >
                      <item.icon className="size-4 shrink-0" aria-hidden="true" />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.comingSoon && (
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-muted uppercase">
                          Soon
                        </span>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>
    </div>
  );
}

export default Sidebar;
