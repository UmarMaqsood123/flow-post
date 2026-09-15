import Spinner from "@/components/ui/Spinner";

function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted" role="status">
      <Spinner className="text-primary" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export default PageLoader;
