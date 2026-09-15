import { CheckCircle2, type LucideIcon } from "lucide-react";
import { Link } from "react-router";
import PageHeader from "@/components/shared/PageHeader";
import Badge from "@/components/ui/Badge";
import { buttonStyles } from "@/components/ui/buttonStyles";
import { paths } from "@/routing/paths";

interface ComingSoonProps {
  title: string;
  description: string;
  icon: LucideIcon;
  /** What the finished page will do. */
  features?: string[];
  note?: string;
}

/** Placeholder for sections of the app that aren't built yet. */
function ComingSoon({ title, description, icon: Icon, features = [], note }: ComingSoonProps) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} description={description} />

      <section className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center sm:py-16">
        <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-6" aria-hidden="true" />
        </span>
        <Badge tone="primary" className="mt-4">
          Coming soon
        </Badge>
        <h2 className="mt-3 text-lg font-semibold">We&apos;re building {title} next</h2>
        {note && <p className="mt-1 max-w-md text-sm text-muted">{note}</p>}

        {features.length > 0 && (
          <ul className="mt-6 flex w-full max-w-md flex-col gap-2.5 text-left">
            {features.map((feature) => (
              <li key={feature} className="flex items-start gap-2.5 text-sm">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                {feature}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <Link to={paths.dashboard} className={buttonStyles("secondary")}>
            Back to dashboard
          </Link>
          <Link to={paths.brandProfile} className={buttonStyles("primary")}>
            Review brand profile
          </Link>
        </div>
      </section>
    </div>
  );
}

export default ComingSoon;
