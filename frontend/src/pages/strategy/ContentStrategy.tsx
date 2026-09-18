import { Compass, Plus, X } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ConfirmModal, DeleteModal } from "@/components/modals";
import ErrorState from "@/components/shared/ErrorState";
import EmptyState from "@/components/shared/EmptyState";
import PageHeader from "@/components/shared/PageHeader";
import GenerateStrategyForm, {
  type StrategyFormValues,
} from "@/components/strategy/GenerateStrategyForm";
import AudienceSection from "@/components/strategy/sections/AudienceSection";
import BrandToneSection from "@/components/strategy/sections/BrandToneSection";
import CtaSection from "@/components/strategy/sections/CtaSection";
import FormatsSection from "@/components/strategy/sections/FormatsSection";
import HashtagSection from "@/components/strategy/sections/HashtagSection";
import PillarsSection from "@/components/strategy/sections/PillarsSection";
import PlatformStrategySection from "@/components/strategy/sections/PlatformStrategySection";
import PostingFrequencySection from "@/components/strategy/sections/PostingFrequencySection";
import TopicsSection from "@/components/strategy/sections/TopicsSection";
import type { SectionProps } from "@/components/strategy/StrategySection";
import StrategyOverview from "@/components/strategy/StrategyOverview";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import Spinner from "@/components/ui/Spinner";
import {
  STRATEGY_SECTION_DETAILS,
  STRATEGY_SECTION_ORDER,
  strategyTitle,
} from "@/config/contentStrategy";
import { getErrorMessage } from "@/lib/forms";
import { hasMinimumRole } from "@/lib/workspaceRoles";
import { paths } from "@/routing/paths";
import useBrandProfile from "@/services/brandProfile/useBrandProfile";
import {
  useActivateContentStrategy,
  useDeleteContentStrategy,
  useContentStrategies,
  useContentStrategy,
  useGenerateContentStrategy,
  useRegenerateContentStrategy,
  useUpdateContentStrategy,
} from "@/services/contentStrategy/useContentStrategies";
import useCurrentWorkspace from "@/services/workspace/useCurrentWorkspace";
import type { StrategyContent, StrategySectionKey } from "@/types/contentStrategy";
import { notify } from "@/lib/toast";

function StrategySkeleton() {
  return (
    <div role="status" className="flex flex-col gap-4">
      <span className="sr-only">Loading strategy…</span>
      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

function ContentStrategyPage() {
  const { current } = useCurrentWorkspace();
  const workspaceId = current?.workspace.id ?? "";
  const [searchParams, setSearchParams] = useSearchParams();
  const [panel, setPanel] = useState<"new" | "regenerate" | null>(null);
  /** AI warnings about a generated version, kept on screen until dismissed. */
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isActivateOpen, setIsActivateOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const versions = useContentStrategies(workspaceId || undefined);
  const brandProfile = useBrandProfile(workspaceId || undefined);
  const summaries = versions.data ?? [];
  const requestedId = searchParams.get("version");
  const selectedId =
    summaries.find((summary) => summary.id === requestedId)?.id ??
    summaries.find((summary) => summary.status === "ACTIVE")?.id ??
    summaries[0]?.id;
  const strategyQuery = useContentStrategy(workspaceId || undefined, selectedId);
  const strategy = strategyQuery.data;

  const generate = useGenerateContentStrategy(workspaceId);
  const regenerate = useRegenerateContentStrategy(workspaceId);
  const update = useUpdateContentStrategy(workspaceId);
  const activate = useActivateContentStrategy(workspaceId);
  const remove = useDeleteContentStrategy(workspaceId);

  // RequireWorkspace guarantees a current workspace; this narrows the type.
  if (!current) return null;

  const canGenerate = hasMinimumRole(current.role, "EDITOR");
  const isAdmin = hasMinimumRole(current.role, "ADMIN");
  const isGenerating = generate.isPending || regenerate.isPending;
  const profile = brandProfile.data;
  const preferredPlatforms = profile?.preferredPlatforms ?? [];

  const selectVersion = (strategyId: string) => {
    setSearchParams(
      (params) => {
        params.set("version", strategyId);
        return params;
      },
      { replace: true },
    );
  };

  const onGenerated = ({
    strategy: created,
    warnings,
  }: {
    strategy: { id: string; version: number };
    warnings: string[];
  }) => {
    setPanel(null);
    selectVersion(created.id);
    notify.success(
      `Version ${created.version} is ready. Review the sections, then activate it when you're happy with it.`,
    );
    setWarnings(warnings);
  };

  const handleGenerate = (values: StrategyFormValues) => {
    setWarnings([]);
    generate.mutate(
      {
        name: values.name.trim() || undefined,
        timeframe: values.timeframe,
        platforms: values.platforms.length > 0 ? values.platforms : undefined,
        focus: values.focus.trim() || undefined,
      },
      { onSuccess: onGenerated },
    );
  };

  const handleRegenerate = (values: StrategyFormValues) => {
    if (!strategy) return;
    setWarnings([]);
    regenerate.mutate(
      {
        strategyId: strategy.id,
        payload: {
          timeframe: values.timeframe,
          platforms: values.platforms,
          focus: values.focus.trim(),
          instructions: values.instructions.trim() || undefined,
        },
      },
      { onSuccess: onGenerated },
    );
  };

  const handleActivate = () => {
    activate.reset();
    setIsActivateOpen(true);
  };

  const confirmActivate = () => {
    if (!strategy) return;
    const title = strategyTitle(strategy);
    setWarnings([]);
    activate.mutate(strategy.id, {
      onSuccess: () => {
        setIsActivateOpen(false);
        notify.success(`${title} is now the active strategy.`);
      },
    });
  };

  const activeStrategy = summaries.find((summary) => summary.status === "ACTIVE");

  const confirmDelete = () => {
    if (!strategy) return;
    const title = strategyTitle(strategy);
    setWarnings([]);
    remove.mutate(strategy.id, {
      onSuccess: () => {
        setIsDeleteOpen(false);
        setPanel(null);
        // Drop the deleted version from the URL so the page falls back to another one.
        setSearchParams(
          (params) => {
            params.delete("version");
            return params;
          },
          { replace: true },
        );
        notify.success(`${title} was deleted.`);
      },
    });
  };

  const renderSections = () => {
    if (!strategy) return null;
    const canEditSections =
      strategy.status === "DRAFT" ? canGenerate : strategy.status === "ACTIVE" && isAdmin;
    const readOnlyReason =
      strategy.status === "ARCHIVED"
        ? "Previous versions are read-only."
        : strategy.status === "ACTIVE" && canGenerate && !isAdmin
          ? "Only admins and owners can edit the active strategy."
          : undefined;

    const sectionProps = <K extends StrategySectionKey>(
      key: K,
    ): SectionProps<StrategyContent[K]> & { key: string } => ({
      // Switching versions starts every section fresh.
      key: `${strategy.id}:${key}`,
      value: strategy.content[key],
      canEdit: canEditSections,
      readOnlyReason,
      // Errors (including edit conflicts) are shown inside the section itself.
      onSave: (value) =>
        update
          .mutateAsync({
            strategyId: strategy.id,
            payload: {
              revision: strategy.revision,
              sections: { [key]: value } as Partial<StrategyContent>,
            },
          })
          .then((saved) => {
            notify.success("Section saved.", "strategy-section");
            return saved;
          }),
      onReload: () => void strategyQuery.refetch(),
    });

    const { key: audienceKey, ...audience } = sectionProps("audienceAnalysis");
    const { key: pillarsKey, ...pillars } = sectionProps("contentPillars");
    const { key: topicsKey, ...topics } = sectionProps("recommendedTopics");
    const { key: platformsKey, ...platforms } = sectionProps("platformStrategy");
    const { key: toneKey, ...tone } = sectionProps("brandTone");
    const { key: ctaKey, ...cta } = sectionProps("ctaStrategy");
    const { key: frequencyKey, ...frequency } = sectionProps("postingFrequency");
    const { key: formatsKey, ...formats } = sectionProps("contentFormats");
    const { key: hashtagsKey, ...hashtags } = sectionProps("hashtagApproach");

    return (
      <>
        <AudienceSection key={audienceKey} {...audience} />
        <PillarsSection key={pillarsKey} {...pillars} />
        <TopicsSection
          key={topicsKey}
          {...topics}
          pillarNames={strategy.content.contentPillars.map((pillar) => pillar.name)}
        />
        <PlatformStrategySection key={platformsKey} {...platforms} />
        <BrandToneSection key={toneKey} {...tone} />
        <CtaSection key={ctaKey} {...cta} />
        <PostingFrequencySection key={frequencyKey} {...frequency} />
        <FormatsSection key={formatsKey} {...formats} />
        <HashtagSection key={hashtagsKey} {...hashtags} />
      </>
    );
  };

  const hasStrategies = summaries.length > 0;

  return (
    <div className="flex w-full flex-col gap-6">
      {strategy && (
        <DeleteModal
          open={isDeleteOpen}
          itemName={strategyTitle(strategy)}
          description={
            strategy.status === "ACTIVE"
              ? "This is the active strategy. Until you activate another, AI Create writes from your brand profile alone. Posts keep their content pillars."
              : strategy.status === "DRAFT"
                ? "This draft and its edits will be removed."
                : "This previous version will be removed from the history."
          }
          isDeleting={remove.isPending}
          error={remove.error}
          onConfirm={confirmDelete}
          onClose={() => setIsDeleteOpen(false)}
        />
      )}
      {strategy && (
        <ConfirmModal
          open={isActivateOpen}
          title={`Make ${strategyTitle(strategy)} active?`}
          message={
            activeStrategy && activeStrategy.id !== strategy.id
              ? `${strategyTitle(activeStrategy)} will move to previous versions. AI Create and the calendar use the active strategy from now on.`
              : "AI Create and the calendar will use this strategy from now on."
          }
          confirmLabel="Make active"
          isLoading={activate.isPending}
          error={activate.error}
          onConfirm={confirmActivate}
          onClose={() => setIsActivateOpen(false)}
        />
      )}
      <PageHeader
        title="Content strategy"
        description={`What ${current.workspace.name} posts, where and why. It's generated from the brand profile, and you can edit all of it.`}
        actions={
          hasStrategies &&
          canGenerate &&
          panel !== "new" && (
            <Button variant="secondary" onClick={() => setPanel("new")} disabled={isGenerating}>
              <Plus className="size-4" aria-hidden="true" />
              New strategy
            </Button>
          )
        }
      />

      {profile && profile.onboarding.status !== "COMPLETED" && (
        <Alert variant="warning" title="The brand profile isn't finished">
          Strategies are based on the brand profile, so results will be more generic until it's
          complete.{" "}
          {isAdmin ? (
            <Link to={paths.brandProfile} className="font-medium underline underline-offset-2">
              Finish the brand profile
            </Link>
          ) : (
            "Ask an admin or owner to finish it."
          )}
        </Alert>
      )}

      {warnings.length > 0 && (
        <Alert variant="warning" title="Worth checking">
          <div className="flex items-start justify-between gap-3">
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setWarnings([])}
              className="cursor-pointer rounded-md p-1 opacity-70 hover:opacity-100"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        </Alert>
      )}

      {isGenerating && (
        <Alert variant="info">
          <div className="flex items-center gap-3">
            <Spinner className="size-4 shrink-0" />
            <p>
              Generating your strategy from the brand profile. This usually takes a minute or two,
              so keep this page open.
            </p>
          </div>
        </Alert>
      )}

      {versions.isPending ? (
        <StrategySkeleton />
      ) : versions.isError ? (
        <ErrorState
          title="We couldn't load your strategies"
          message={getErrorMessage(versions.error)}
          onRetry={() => void versions.refetch()}
          isRetrying={versions.isRefetching}
        />
      ) : !hasStrategies ? (
        canGenerate ? (
          <section className="rounded-xl border border-line bg-surface p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Compass className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-semibold">Create your first content strategy</h2>
                <p className="mt-1 text-sm text-muted">
                  FlowPost analyses your audience and plans pillars, topics, platforms, tone, calls
                  to action, posting frequency, formats and hashtags. You can edit everything before
                  you activate it.
                </p>
              </div>
            </div>
            <div className="mt-6">
              <GenerateStrategyForm
                mode="generate"
                defaults={{ timeframe: "MONTH", platforms: [], focus: "" }}
                preferredPlatforms={preferredPlatforms}
                isSubmitting={generate.isPending}
                error={generate.error}
                onSubmit={handleGenerate}
              />
            </div>
          </section>
        ) : (
          <EmptyState
            icon={Compass}
            title="No content strategy yet"
            description="An editor, admin or owner can generate one from the brand profile."
          />
        )
      ) : (
        <>
          {panel === "new" && (
            <section className="rounded-xl border border-line bg-surface p-5 sm:p-6">
              <h2 className="font-semibold">New strategy</h2>
              <p className="mt-1 text-sm text-muted">
                Generates a new draft version. Your current versions stay as they are.
              </p>
              <div className="mt-5">
                <GenerateStrategyForm
                  mode="generate"
                  defaults={{ timeframe: "MONTH", platforms: [], focus: "" }}
                  preferredPlatforms={preferredPlatforms}
                  isSubmitting={generate.isPending}
                  error={generate.error}
                  onSubmit={handleGenerate}
                  onCancel={() => setPanel(null)}
                />
              </div>
            </section>
          )}

          {strategyQuery.isPending ? (
            <StrategySkeleton />
          ) : strategyQuery.isError || !strategy ? (
            <ErrorState
              title="We couldn't load this strategy"
              message={getErrorMessage(strategyQuery.error)}
              onRetry={() => void strategyQuery.refetch()}
              isRetrying={strategyQuery.isRefetching}
            />
          ) : (
            <>
              <StrategyOverview
                strategy={strategy}
                versions={summaries}
                onSelectVersion={(strategyId) => {
                  setPanel(null);
                  selectVersion(strategyId);
                }}
                canActivate={isAdmin}
                canDelete={strategy.status === "DRAFT" ? canGenerate : isAdmin}
                onDelete={() => {
                  remove.reset();
                  setIsDeleteOpen(true);
                }}
                canRegenerate={canGenerate}
                canRename={
                  strategy.status === "DRAFT"
                    ? canGenerate
                    : strategy.status === "ACTIVE" && isAdmin
                }
                isActivating={activate.isPending}
                isGenerating={isGenerating}
                onActivate={handleActivate}
                onRegenerate={() => setPanel("regenerate")}
                onRename={(name) =>
                  update.mutateAsync({
                    strategyId: strategy.id,
                    payload: { revision: strategy.revision, name },
                  })
                }
                brandProfileUpdatedAt={profile?.updatedAt ?? null}
              />

              {panel === "regenerate" && (
                <section className="rounded-xl border border-line bg-surface p-5 sm:p-6">
                  <h2 className="font-semibold">Regenerate {strategyTitle(strategy)}</h2>
                  <p className="mt-1 text-sm text-muted">
                    Uses the latest brand profile and creates a new draft version.
                  </p>
                  <div className="mt-5">
                    <GenerateStrategyForm
                      key={strategy.id}
                      mode="regenerate"
                      defaults={{
                        timeframe: strategy.inputs.timeframe,
                        platforms: strategy.inputs.platforms,
                        focus: strategy.inputs.focus ?? "",
                      }}
                      preferredPlatforms={preferredPlatforms}
                      isSubmitting={regenerate.isPending}
                      error={regenerate.error}
                      onSubmit={handleRegenerate}
                      onCancel={() => setPanel(null)}
                    />
                  </div>
                </section>
              )}

              <nav aria-label="Strategy sections" className="-mx-1 overflow-x-auto px-1">
                <ul className="flex gap-2 pb-1">
                  {STRATEGY_SECTION_ORDER.map((key) => (
                    <li key={key} className="shrink-0">
                      <a
                        href={`#${key}`}
                        className="inline-flex rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted transition-colors hover:border-primary/40 hover:text-ink"
                      >
                        {STRATEGY_SECTION_DETAILS[key].title}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>

              <div className="flex flex-col gap-4">{renderSections()}</div>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default ContentStrategyPage;
