import { auditActionLabel, formatDateTimeShort } from "@/lib/adminFormat";
import type { AuditRecord } from "@/types/admin";

function AuditHistory({ records }: { records: AuditRecord[] }) {
  if (records.length === 0) return <p className="text-sm text-muted">No admin activity yet.</p>;
  return (
    <ol className="flex flex-col divide-y divide-line text-sm">
      {records.map((record, index) => (
        <li key={record._id ?? record.id ?? index} className="flex flex-col gap-0.5 py-2">
          <span className="font-medium">{auditActionLabel(record.action)}</span>
          <span className="text-xs text-muted">
            {formatDateTimeShort(record.createdAt)} · {record.actorEmail ?? "command line"}
          </span>
          {record.reason && <span className="text-xs">Reason: {record.reason}</span>}
        </li>
      ))}
    </ol>
  );
}

export default AuditHistory;
