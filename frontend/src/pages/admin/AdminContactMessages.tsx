import { Mail, UserRound } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import AdminShell from "@/components/admin/AdminShell";
import { FilterBar, SearchFilter, SelectFilter } from "@/components/admin/Filters";
import Pagination from "@/components/admin/Pagination";
import { useListParams } from "@/components/admin/useListParams";
import Modal from "@/components/modals";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { buttonStyles } from "@/components/ui/buttonStyles";
import ChoiceGroup from "@/components/ui/ChoiceGroup";
import Skeleton from "@/components/ui/Skeleton";
import TextAreaField from "@/components/ui/TextAreaField";
import { CONTACT_STATUS_DETAILS, CONTACT_TOPIC_OPTIONS, contactTopicLabel } from "@/config/contact";
import { formatDateTimeShort } from "@/lib/adminFormat";
import { getErrorMessage } from "@/lib/forms";
import { notify } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { paths } from "@/routing/paths";
import { useAdminContactMessages, useUpdateContactMessage } from "@/services/admin/useAdmin";
import type { AdminContactMessage, ContactStatus } from "@/types/contact";

const KEYS = ["q", "status", "topic"] as const;
const STATUS_OPTIONS = (Object.keys(CONTACT_STATUS_DETAILS) as ContactStatus[]).map((status) => ({
  value: status,
  label: CONTACT_STATUS_DETAILS[status].label,
}));

function StatusBadge({ status }: { status: ContactStatus }) {
  const details = CONTACT_STATUS_DETAILS[status];
  return <Badge tone={details.tone}>{details.label}</Badge>;
}

function MessageModal({ message, onClose }: { message: AdminContactMessage; onClose: () => void }) {
  const update = useUpdateContactMessage();
  const [status, setStatus] = useState<ContactStatus>(message.status);
  const [note, setNote] = useState(message.adminNote ?? "");
  const changed = status !== message.status || note.trim() !== (message.adminNote ?? "");
  const replyHref = `mailto:${message.email}?subject=${encodeURIComponent(
    `Re: your message to FlowPost (${contactTopicLabel(message.topic)})`,
  )}`;

  const save = () =>
    update.mutate(
      { id: message.id, status, adminNote: note.trim() || null },
      {
        onSuccess: () => {
          notify.success("Message updated");
          onClose();
        },
      },
    );

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Message from ${message.name}`}
      description={`${contactTopicLabel(message.topic)} · ${formatDateTimeShort(message.createdAt)}`}
      dismissible={!update.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={update.isPending}>
            Close
          </Button>
          <Button onClick={save} isLoading={update.isPending} disabled={!changed}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {update.isError && <Alert variant="error">{getErrorMessage(update.error)}</Alert>}

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <a href={replyHref} className={buttonStyles("secondary", "gap-2")}>
            <Mail className="size-4" aria-hidden="true" />
            Reply to {message.email}
          </a>
          {message.userId && (
            <Link
              to={`${paths.adminUsers}/${message.userId}`}
              className="inline-flex items-center gap-1.5 text-primary hover:underline"
            >
              <UserRound className="size-4" aria-hidden="true" />
              View their account
            </Link>
          )}
        </div>

        <p className="rounded-lg border border-line bg-slate-50 p-4 text-sm leading-relaxed whitespace-pre-wrap text-ink">
          {message.message}
        </p>

        <ChoiceGroup<ContactStatus>
          layout="chips"
          label="Status"
          options={STATUS_OPTIONS}
          value={status}
          onChange={setStatus}
          hint={
            message.handledByEmail && message.handledAt
              ? `Last updated by ${message.handledByEmail} on ${formatDateTimeShort(message.handledAt)}.`
              : undefined
          }
        />

        <TextAreaField
          label="Internal note"
          rows={3}
          maxLength={2000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          hint="Only admins see this. The sender never does."
        />
      </div>
    </Modal>
  );
}

function AdminContactMessages() {
  const { values, setFilter, setPage } = useListParams(KEYS);
  const messages = useAdminContactMessages({ ...values, limit: 25 });
  const [openId, setOpenId] = useState<string | null>(null);
  const openMessage = messages.data?.items.find((message) => message.id === openId) ?? null;
  const unread = messages.data?.unread ?? 0;

  return (
    <AdminShell
      title="Messages"
      description={
        messages.data
          ? unread === 0
            ? "Everything sent through the Contact page. You're all caught up."
            : `Everything sent through the Contact page. ${unread} new ${unread === 1 ? "message needs" : "messages need"} a reply.`
          : "Everything sent through the Contact page."
      }
    >
      <FilterBar>
        <SearchFilter
          key={values.q}
          label="Search messages"
          placeholder="Name, email or text"
          value={values.q}
          onChange={(value) => setFilter("q", value)}
        />
        <SelectFilter
          label="Status"
          value={values.status}
          onChange={(value) => setFilter("status", value)}
          options={STATUS_OPTIONS}
        />
        <SelectFilter
          label="Topic"
          value={values.topic}
          onChange={(value) => setFilter("topic", value)}
          options={CONTACT_TOPIC_OPTIONS}
        />
      </FilterBar>

      {messages.isError && <Alert variant="error">{getErrorMessage(messages.error)}</Alert>}

      {messages.isLoading && !messages.data ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : (
        <ul
          aria-label="Contact messages"
          className={cn(
            "flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface",
            messages.isFetching && "opacity-60",
          )}
        >
          {messages.data?.items.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-muted">No messages match.</li>
          )}
          {messages.data?.items.map((message) => (
            <li key={message.id}>
              <button
                type="button"
                onClick={() => setOpenId(message.id)}
                className="flex w-full cursor-pointer flex-col gap-1.5 px-4 py-3.5 text-left hover:bg-slate-50 sm:flex-row sm:items-start sm:gap-4"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "text-sm",
                        message.status === "NEW" ? "font-semibold" : "font-medium",
                      )}
                    >
                      {message.name}
                    </span>
                    <span className="text-xs text-muted">{message.email}</span>
                  </span>
                  <span className="line-clamp-2 text-sm text-muted">{message.message}</span>
                </span>
                <span className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end">
                  <span className="text-xs text-muted">
                    {formatDateTimeShort(message.createdAt)}
                  </span>
                  <span className="flex gap-1.5">
                    <Badge>{contactTopicLabel(message.topic)}</Badge>
                    <StatusBadge status={message.status} />
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {messages.data && (
        <Pagination
          page={messages.data.page}
          pages={messages.data.pages}
          total={messages.data.total}
          onPage={setPage}
        />
      )}

      {openMessage && (
        <MessageModal key={openMessage.id} message={openMessage} onClose={() => setOpenId(null)} />
      )}
    </AdminShell>
  );
}

export default AdminContactMessages;
