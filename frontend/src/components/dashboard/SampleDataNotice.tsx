import { Link } from "react-router";
import Badge from "@/components/ui/Badge";
import { paths } from "@/routing/paths";

/** Flags mocked analytics so nobody mistakes them for real numbers. */
function SampleDataNotice() {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex flex-wrap items-center gap-2">
        <Badge tone="warning">Sample data</Badge>
        These numbers are examples until social accounts can be connected.
      </p>
      <Link to={paths.socialAccounts} className="shrink-0 font-medium underline">
        About social accounts
      </Link>
    </div>
  );
}

export default SampleDataNotice;
