import { Sparkles } from "lucide-react";
import { Link } from "react-router";
import { paths } from "@/routing/paths";

interface UpgradeNoticeProps {
  title: string;
  description: string;
  /** Only the billing owner can change the plan; others are told who to ask. */
  canManage: boolean;
}

/** Shown in place of a feature the workspace's plan doesn't include. */
function UpgradeNotice({ title, description, canManage }: UpgradeNoticeProps) {
  return (
    <section className="flex flex-col items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-5 sm:p-6">
      <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Sparkles className="size-5" aria-hidden="true" />
      </span>
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
      {canManage ? (
        <Link
          to={paths.billing}
          className="inline-flex items-center rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-white hover:bg-primary-hover"
        >
          See plans
        </Link>
      ) : (
        <p className="text-sm text-muted">Ask the workspace's billing owner to upgrade.</p>
      )}
    </section>
  );
}

export default UpgradeNotice;
