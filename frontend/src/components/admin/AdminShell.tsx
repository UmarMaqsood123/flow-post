import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "react-router";
import PageHeader from "@/components/shared/PageHeader";
import { cn } from "@/lib/utils";
import { paths } from "@/routing/paths";

const SECTIONS = [
  { label: "Dashboard", to: paths.admin, end: true },
  { label: "Users", to: paths.adminUsers },
  { label: "Workspaces", to: paths.adminWorkspaces },
  { label: "Subscriptions", to: paths.adminSubscriptions },
  { label: "Plans", to: paths.adminPlans },
  { label: "AI usage", to: paths.adminAIUsage },
  { label: "Connections", to: paths.adminSocialConnections },
  { label: "Publishing failures", to: paths.adminPublishingFailures },
  { label: "Messages", to: paths.adminContactMessages },
  { label: "Audit log", to: paths.adminAuditLog },
];

interface AdminShellProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

/** Frame for every admin page: a clear "admin" marker and the section tabs. */
function AdminShell({ title, description, actions, children }: AdminShellProps) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <p className="inline-flex w-fit items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900">
        <ShieldCheck className="size-3.5" aria-hidden="true" />
        Super admin
      </p>
      <PageHeader title={title} description={description} actions={actions} />
      <nav aria-label="Admin sections" className="-mt-2 overflow-x-auto border-b border-line">
        <ul className="flex gap-1">
          {SECTIONS.map((section) => (
            <li key={section.to} className="shrink-0">
              <NavLink
                to={section.to}
                end={section.end}
                className={({ isActive }) =>
                  cn(
                    "-mb-px block border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap",
                    isActive
                      ? "border-primary text-primary"
                      : "border-transparent text-muted hover:text-ink",
                  )
                }
              >
                {section.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      {children}
    </div>
  );
}

export default AdminShell;
