import TextAreaField from "@/components/ui/TextAreaField";
import TextField from "@/components/ui/TextField";
import { STRATEGY_LIMITS as LIMITS } from "@/config/contentStrategy";
import type { ContentPillar } from "@/types/contentStrategy";
import { ListEditor, TextListField } from "../fields";
import StrategySection, { type SectionProps } from "../StrategySection";
import { BulletList, Detail, EmptyNote } from "../view";

const newPillar = (): ContentPillar => ({
  name: "",
  description: "",
  objective: "",
  exampleTopics: [],
});

function PillarsSection(props: SectionProps<ContentPillar[]>) {
  return (
    <StrategySection
      {...props}
      section="contentPillars"
      renderView={(pillars) =>
        pillars.length === 0 ? (
          <EmptyNote>No content pillars yet.</EmptyNote>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {pillars.map((pillar, index) => (
              <article key={pillar.name} className="rounded-lg border border-line p-4">
                <p className="text-xs font-medium text-primary">Pillar {index + 1}</p>
                <h3 className="mt-0.5 font-medium">{pillar.name}</h3>
                {pillar.description && (
                  <p className="mt-1 text-sm text-muted">{pillar.description}</p>
                )}
                <div className="mt-4 flex flex-col gap-4">
                  {pillar.objective && (
                    <Detail label="Objective">
                      <p className="text-sm">{pillar.objective}</p>
                    </Detail>
                  )}
                  <Detail label="Example topics">
                    <BulletList items={pillar.exampleTopics} />
                  </Detail>
                </div>
              </article>
            ))}
          </div>
        )
      }
      renderEditor={({ value, onChange, errorAt }) => (
        <ListEditor
          label="Pillars"
          itemName="Pillar"
          items={value}
          max={LIMITS.pillars}
          createItem={newPillar}
          onChange={onChange}
          errorAt={errorAt}
          renderItem={(pillar, update, itemError) => (
            <>
              <TextField
                label="Name"
                maxLength={LIMITS.label}
                value={pillar.name}
                onChange={(event) => update({ ...pillar, name: event.target.value })}
                error={itemError("name")}
              />
              <TextAreaField
                label="Description"
                rows={2}
                maxLength={LIMITS.text}
                value={pillar.description}
                onChange={(event) => update({ ...pillar, description: event.target.value })}
                error={itemError("description")}
              />
              <TextAreaField
                label="Objective"
                rows={2}
                maxLength={LIMITS.text}
                value={pillar.objective}
                onChange={(event) => update({ ...pillar, objective: event.target.value })}
                error={itemError("objective")}
              />
              <TextListField
                label="Example topics"
                value={pillar.exampleTopics}
                onChange={(exampleTopics) => update({ ...pillar, exampleTopics })}
                error={itemError("exampleTopics")}
              />
            </>
          )}
        />
      )}
    />
  );
}

export default PillarsSection;
