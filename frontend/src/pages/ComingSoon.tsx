import type { LucideIcon } from "lucide-react";
import { Link } from "react-router";
import PageHeader from "@/components/shared/PageHeader";
import { buttonStyles } from "@/components/ui/buttonStyles";
import { paths } from "@/routing/paths";

interface ComingSoonProps {
  title: string;
  description: string;
  icon: LucideIcon;
}

/** Placeholder for sections of the app that aren't built yet. */
function ComingSoon({ title, description, icon: Icon }: ComingSoonProps) {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={title} description={description} />

      <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-16 text-center">
        <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-6" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-lg font-semibold">Coming soon</h2>
        <p className="mt-1 max-w-md text-sm text-muted">
          We&apos;re building this part of FlowPost next. In the meantime, set up your workspace and
          invite your team.
        </p>
        <Link to={paths.dashboard} className={buttonStyles("secondary", "mt-6")}>
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

export default ComingSoon;
