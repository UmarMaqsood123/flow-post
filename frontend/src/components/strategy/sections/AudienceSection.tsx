import TextAreaField from "@/components/ui/TextAreaField";
import TextField from "@/components/ui/TextField";
import { STRATEGY_LIMITS as LIMITS } from "@/config/contentStrategy";
import type { AudienceAnalysis, AudienceSegment } from "@/types/contentStrategy";
import { nestErrors } from "../errorPaths";
import { ListEditor, TextListField } from "../fields";
import StrategySection, { type SectionProps } from "../StrategySection";
import { BulletList, Detail, EmptyNote, Prose } from "../view";

const newSegment = (): AudienceSegment => ({
  name: "",
  description: "",
  painPoints: [],
  motivations: [],
  contentPreferences: [],
});

function AudienceSection(props: SectionProps<AudienceAnalysis>) {
  return (
    <StrategySection
      {...props}
      section="audienceAnalysis"
      renderView={(value) => (
        <div className="flex flex-col gap-5">
          <Prose text={value.summary} />
          {value.segments.length === 0 ? (
            <EmptyNote>No audience segments yet.</EmptyNote>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {value.segments.map((segment) => (
                <article key={segment.name} className="rounded-lg border border-line p-4">
                  <h3 className="font-medium">{segment.name}</h3>
                  {segment.description && (
                    <p className="mt-1 text-sm text-muted">{segment.description}</p>
                  )}
                  <div className="mt-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                    <Detail label="Pain points">
                      <BulletList items={segment.painPoints} />
                    </Detail>
                    <Detail label="Motivations">
                      <BulletList items={segment.motivations} />
                    </Detail>
                    <Detail label="Content they want">
                      <BulletList items={segment.contentPreferences} />
                    </Detail>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
      renderEditor={({ value, onChange, errorAt }) => (
        <>
          <TextAreaField
            label="Summary"
            rows={4}
            maxLength={LIMITS.summary}
            value={value.summary}
            onChange={(event) => onChange({ ...value, summary: event.target.value })}
            error={errorAt("summary")}
          />
          <ListEditor
            label="Audience segments"
            itemName="Segment"
            items={value.segments}
            max={LIMITS.segments}
            createItem={newSegment}
            onChange={(segments) => onChange({ ...value, segments })}
            errorAt={nestErrors(errorAt, "segments")}
            renderItem={(segment, update, itemError) => (
              <>
                <TextField
                  label="Name"
                  maxLength={LIMITS.label}
                  value={segment.name}
                  onChange={(event) => update({ ...segment, name: event.target.value })}
                  error={itemError("name")}
                />
                <TextAreaField
                  label="Description"
                  rows={2}
                  maxLength={LIMITS.text}
                  value={segment.description}
                  onChange={(event) => update({ ...segment, description: event.target.value })}
                  error={itemError("description")}
                />
                <TextListField
                  label="Pain points"
                  value={segment.painPoints}
                  onChange={(painPoints) => update({ ...segment, painPoints })}
                  error={itemError("painPoints")}
                />
                <TextListField
                  label="Motivations"
                  value={segment.motivations}
                  onChange={(motivations) => update({ ...segment, motivations })}
                  error={itemError("motivations")}
                />
                <TextListField
                  label="Content they want"
                  value={segment.contentPreferences}
                  onChange={(contentPreferences) => update({ ...segment, contentPreferences })}
                  error={itemError("contentPreferences")}
                />
              </>
            )}
          />
        </>
      )}
    />
  );
}

export default AudienceSection;
