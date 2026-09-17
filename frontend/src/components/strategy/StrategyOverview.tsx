import { CheckCircle2, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Dropdown from "@/components/ui/Dropdown";
import TextField from "@/components/ui/TextField";
import { SOCIAL_PLATFORM_OPTIONS } from "@/config/brandProfile";
import {
  optionLabel,
  STRATEGY_LIMITS,
  STRATEGY_STATUS_DETAILS,
  strategyTitle,
  TIMEFRAME_OPTIONS,
} from "@/config/contentStrategy";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { getErrorMessage } from "@/lib/forms";
import type { ContentStrategy, ContentStrategySummary } from "@/types/contentStrategy";
import { Detail } from "./view";

interface StrategyOverviewProps {
  strategy: ContentStrategy;
  versions: ContentStrategySummary[];
  onSelectVersion: (strategyId: string) => void;
  canActivate: boolean;
  /** Editors can delete drafts; the active strategy and previous versions need an admin. */
  canDelete: boolean;
  canRegenerate: boolean;
  canRename: boolean;
  isActivating: boolean;
  isGenerating: boolean;
  onActivate: () => void;
  onDelete: () => void;
  onRegenerate: () => void;
  onRename: (name: string | null) => Promise<unknown>;
  /** When the brand profile last changed, to flag outdated strategies. */
  brandProfileUpdatedAt: string | null;
}

function RenameForm({
  initialName,
  onRename,
  onDone,
}: {
  initialName: string;
  onRename: (name: string | null) => Promise<unknown>;
  onDone: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      await onRename(name.trim() || null);
      onDone();
    } catch (renameError) {
      setError(getErrorMessage(renameError));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <TextField
        label="Strategy name"
        placeholder="Leave empty to use the version number"
        className="w-full sm:max-w-sm"
        maxLength={STRATEGY_LIMITS.name}
        value={name}
        onChange={(event) => setName(event.target.value)}
        error={error ?? undefined}
        autoFocus
      />
      <div className="flex gap-2">
        <Button type="submit" isLoading={isSaving}>
          Save
        </Button>
        <Button variant="secondary" onClick={onDone} disabled={isSaving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function StrategyOverview({
  strategy,
  versions,
  onSelectVersion,
  canActivate,
  canDelete,
  canRegenerate,
  canRename,
  isActivating,
  isGenerating,
  onActivate,
  onDelete,
  onRegenerate,
  onRename,
  brandProfileUpdatedAt,
}: StrategyOverviewProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const status = STRATEGY_STATUS_DETAILS[strategy.status];
  const { inputs, generation } = strategy;

  const versionOptions = versions.map((version) => ({
    name: strategyTitle(version),
    value: version.id,
    description: `${STRATEGY_STATUS_DETAILS[version.status].label} · ${formatDateTime(version.createdAt)}`,
  }));
  const selectedOption = versionOptions.find((option) => option.value === strategy.id) ?? null;

  const profileChangedSince =
    brandProfileUpdatedAt !== null &&
    (generation.brandProfileUpdatedAt === null ||
      new Date(brandProfileUpdatedAt) > new Date(generation.brandProfileUpdatedAt));

  return (
    <section className="rounded-xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{strategyTitle(strategy)}</h2>
            <Badge tone={status.tone}>{status.label}</Badge>
            {canRename && !isRenaming && (
              <button
                type="button"
                onClick={() => setIsRenaming(true)}
                className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted hover:bg-slate-100 hover:text-ink"
              >
                <Pencil className="size-3" aria-hidden="true" />
                Rename
              </button>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">
            Generated {formatRelativeTime(generation.generatedAt)}
            {strategy.createdBy ? ` by ${strategy.createdBy.name}` : ""}
            {strategy.basedOnVersion !== null ? ` · from version ${strategy.basedOnVersion}` : ""}
            {strategy.editedAt
              ? ` · edited ${formatRelativeTime(strategy.editedAt)}${strategy.editedBy ? ` by ${strategy.editedBy.name}` : ""}`
              : ""}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:justify-end">
          {versions.length > 1 && (
            <Dropdown
              ariaLabel="Strategy version"
              size="sm"
              className="w-full sm:w-60"
              menuClassName="sm:w-72"
              options={versionOptions}
              selected={selectedOption}
              onChange={(option) => onSelectVersion(option.value)}
            />
          )}
          {canRegenerate && (
            <Button variant="secondary" onClick={onRegenerate} disabled={isGenerating}>
              <RefreshCw className="size-4" aria-hidden="true" />
              Regenerate
            </Button>
          )}
          {canDelete && (
            <Button variant="danger" onClick={onDelete} disabled={isGenerating || isActivating}>
              <Trash2 className="size-4" aria-hidden="true" />
              Delete
            </Button>
          )}
          {canActivate && strategy.status !== "ACTIVE" && (
            <Button onClick={onActivate} isLoading={isActivating} disabled={isGenerating}>
              {!isActivating && <CheckCircle2 className="size-4" aria-hidden="true" />}
              {strategy.status === "ARCHIVED" ? "Activate again" : "Activate"}
            </Button>
          )}
        </div>
      </div>

      {isRenaming && (
        <div className="mt-4">
          <RenameForm
            initialName={strategy.name ?? ""}
            onRename={onRename}
            onDone={() => setIsRenaming(false)}
          />
        </div>
      )}

      <dl className="mt-5 grid gap-4 border-t border-line pt-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Detail label="Timeframe">
          <dd>{optionLabel(TIMEFRAME_OPTIONS, inputs.timeframe)}</dd>
        </Detail>
        <Detail label="Platforms">
          <dd>
            {inputs.platforms.length > 0
              ? inputs.platforms
                  .map((platform) => optionLabel(SOCIAL_PLATFORM_OPTIONS, platform))
                  .join(", ")
              : "From the brand profile"}
          </dd>
        </Detail>
        <Detail label="Focus">
          <dd className={inputs.focus ? undefined : "text-muted"}>{inputs.focus ?? "None"}</dd>
        </Detail>
        <Detail label={strategy.status === "ACTIVE" ? "Active since" : "Status"}>
          <dd>
            {strategy.status === "ACTIVE" && strategy.activatedAt
              ? `${formatRelativeTime(strategy.activatedAt)}${strategy.activatedBy ? ` · ${strategy.activatedBy.name}` : ""}`
              : status.label}
          </dd>
        </Detail>
        {inputs.instructions && (
          <div className="sm:col-span-2 lg:col-span-4">
            <Detail label="Changes requested">
              <dd>{inputs.instructions}</dd>
            </Detail>
          </div>
        )}
      </dl>

      <div className="mt-5 flex flex-col gap-3 empty:hidden">
        {strategy.status === "DRAFT" && (
          <Alert variant="info">
            {canActivate
              ? "This is a draft. Review and edit the sections, then activate it to make it your workspace's strategy."
              : "This is a draft. An admin or owner can activate it once it's ready."}
          </Alert>
        )}
        {strategy.status === "ARCHIVED" && (
          <Alert variant="info">
            This is a previous version, so it can't be edited.
            {canActivate ? " Activate it again to use it." : ""}
          </Alert>
        )}
        {profileChangedSince && (
          <Alert variant="warning">
            The brand profile changed after this version was generated.
            {canRegenerate ? " Regenerate to use the latest details." : ""}
          </Alert>
        )}
      </div>
    </section>
  );
}

export default StrategyOverview;
