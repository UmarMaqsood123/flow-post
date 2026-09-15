import TextAreaField from "@/components/ui/TextAreaField";
import { STRATEGY_LIMITS as LIMITS } from "@/config/contentStrategy";
import type { HashtagApproach } from "@/types/contentStrategy";
import { NumberField, TextListField } from "../fields";
import StrategySection, { type SectionProps } from "../StrategySection";
import { BulletList, Chips, Detail, Prose } from "../view";

const HASHTAG_HINT = "Spaces and symbols are removed and # is added when you save.";

function HashtagSection(props: SectionProps<HashtagApproach>) {
  return (
    <StrategySection
      {...props}
      section="hashtagApproach"
      renderView={(approach) => (
        <div className="flex flex-col gap-5">
          <p className="text-sm">
            <span className="font-semibold tabular-nums">
              {approach.minPerPost === approach.maxPerPost
                ? approach.minPerPost
                : `${approach.minPerPost}–${approach.maxPerPost}`}
            </span>{" "}
            <span className="text-muted">hashtags per post</span>
          </p>
          <Prose text={approach.summary} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Detail label="Branded">
              <Chips labels={approach.branded} />
            </Detail>
            <Detail label="Community">
              <Chips labels={approach.community} />
            </Detail>
            <Detail label="Niche">
              <Chips labels={approach.niche} />
            </Detail>
          </div>
          <Detail label="Guidelines">
            <BulletList items={approach.guidelines} />
          </Detail>
        </div>
      )}
      renderEditor={({ value, onChange, errorAt }) => (
        <>
          <TextAreaField
            label="Summary"
            rows={3}
            maxLength={LIMITS.summary}
            value={value.summary}
            onChange={(event) => onChange({ ...value, summary: event.target.value })}
            error={errorAt("summary")}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField
              label="Minimum per post"
              max={LIMITS.hashtagsPerPost}
              value={value.minPerPost}
              onChange={(minPerPost) => onChange({ ...value, minPerPost })}
              error={errorAt("minPerPost")}
            />
            <NumberField
              label="Maximum per post"
              max={LIMITS.hashtagsPerPost}
              value={value.maxPerPost}
              onChange={(maxPerPost) => onChange({ ...value, maxPerPost })}
              error={errorAt("maxPerPost")}
            />
          </div>
          {(["branded", "community", "niche"] as const).map((group) => (
            <TextListField
              key={group}
              label={`${group[0].toUpperCase()}${group.slice(1)} hashtags`}
              value={value[group]}
              onChange={(tags) => onChange({ ...value, [group]: tags })}
              max={LIMITS.hashtags}
              maxLength={LIMITS.hashtag}
              commaSeparates
              hint={HASHTAG_HINT}
              error={errorAt(group)}
            />
          ))}
          <TextListField
            label="Guidelines"
            value={value.guidelines}
            onChange={(guidelines) => onChange({ ...value, guidelines })}
            error={errorAt("guidelines")}
          />
        </>
      )}
    />
  );
}

export default HashtagSection;
