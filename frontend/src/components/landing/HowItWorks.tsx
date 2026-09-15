import { steps } from "@/config/landing";
import Container from "./Container";
import SectionHeading from "./SectionHeading";

function HowItWorks() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="scroll-mt-16 border-y border-line bg-slate-50/70 py-20 sm:py-28"
    >
      <Container>
        <SectionHeading
          id="how-it-works-heading"
          eyebrow="How it works"
          title="From idea to published in three steps"
          description="No blank-page stress and no copy-pasting between apps."
        />

        <ol className="relative mt-14 grid gap-5 md:grid-cols-3">
          {steps.map(({ icon: Icon, title, description }, index) => (
            <li key={title} className="relative rounded-2xl border border-line bg-surface p-6">
              <div className="flex items-center justify-between">
                <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-white">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className="text-sm font-semibold text-muted">Step {index + 1}</span>
              </div>
              <h3 className="mt-5 text-lg font-semibold">{title}</h3>
              <p className="mt-2 leading-relaxed text-muted">{description}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

export default HowItWorks;
