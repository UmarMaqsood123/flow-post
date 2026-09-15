import { useId } from "react";
import ChoiceGroup from "@/components/ui/ChoiceGroup";
import Badge from "@/components/ui/Badge";
import TextAreaField from "@/components/ui/TextAreaField";
import TextField from "@/components/ui/TextField";
import { SOCIAL_PLATFORM_OPTIONS } from "@/config/brandProfile";
import {
  optionLabel,
  POST_FORMAT_OPTIONS,
  STRATEGY_LIMITS as LIMITS,
} from "@/config/contentStrategy";
import type { RecommendedTopic } from "@/types/contentStrategy";
import { ListEditor, SelectField } from "../fields";
import StrategySection, { type SectionProps } from "../StrategySection";
import { EmptyNote } from "../view";

const newTopic = (): RecommendedTopic => ({
  title: "",
  pillar: "",
  angle: "",
  format: "TEXT",
  platforms: [],
});

interface TopicsSectionProps extends SectionProps<RecommendedTopic[]> {
  /** Suggestions for the pillar field. */
  pillarNames: string[];
}

function TopicsSection({ pillarNames, ...props }: TopicsSectionProps) {
  const pillarListId = useId();

  return (
    <StrategySection
      {...props}
      section="recommendedTopics"
      renderView={(topics) =>
        topics.length === 0 ? (
          <EmptyNote>No recommended topics yet.</EmptyNote>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {topics.map((topic) => (
              <li key={topic.title} className="p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <h3 className="font-medium">{topic.title}</h3>
                  <div className="flex flex-wrap gap-1.5 sm:justify-end">
                    {topic.pillar && <Badge tone="primary">{topic.pillar}</Badge>}
                    <Badge>{optionLabel(POST_FORMAT_OPTIONS, topic.format)}</Badge>
                    {topic.platforms.map((platform) => (
                      <Badge key={platform}>{optionLabel(SOCIAL_PLATFORM_OPTIONS, platform)}</Badge>
                    ))}
                  </div>
                </div>
                {topic.angle && <p className="mt-1 text-sm text-muted">{topic.angle}</p>}
              </li>
            ))}
          </ul>
        )
      }
      renderEditor={({ value, onChange, errorAt }) => (
        <>
          <datalist id={pillarListId}>
            {pillarNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <ListEditor
            label="Topics"
            itemName="Topic"
            items={value}
            max={LIMITS.topics}
            createItem={newTopic}
            onChange={onChange}
            errorAt={errorAt}
            renderItem={(topic, update, itemError) => (
              <>
                <TextField
                  label="Topic"
                  maxLength={LIMITS.item}
                  value={topic.title}
                  onChange={(event) => update({ ...topic, title: event.target.value })}
                  error={itemError("title")}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField
                    label="Pillar"
                    list={pillarListId}
                    maxLength={LIMITS.label}
                    value={topic.pillar}
                    onChange={(event) => update({ ...topic, pillar: event.target.value })}
                    error={itemError("pillar")}
                  />
                  <SelectField
                    label="Format"
                    options={POST_FORMAT_OPTIONS}
                    value={topic.format}
                    onChange={(format) => update({ ...topic, format })}
                    error={itemError("format")}
                  />
                </div>
                <TextAreaField
                  label="Angle"
                  rows={2}
                  maxLength={LIMITS.text}
                  value={topic.angle}
                  onChange={(event) => update({ ...topic, angle: event.target.value })}
                  error={itemError("angle")}
                />
                <ChoiceGroup
                  label="Platforms"
                  layout="chips"
                  multiple
                  options={SOCIAL_PLATFORM_OPTIONS}
                  value={topic.platforms}
                  onChange={(platforms) => update({ ...topic, platforms })}
                  error={itemError("platforms")}
                />
              </>
            )}
          />
        </>
      )}
    />
  );
}

export default TopicsSection;
