import Button from "@/components/ui/Button";

interface PaginationProps {
  page: number;
  pages: number;
  total: number;
  onPage: (page: number) => void;
}

function Pagination({ page, pages, total, onPage }: PaginationProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
      <span>
        {total.toLocaleString()} {total === 1 ? "result" : "results"} · page {page} of {pages}
      </span>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          className="px-3 py-1.5"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          className="px-3 py-1.5"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export default Pagination;
