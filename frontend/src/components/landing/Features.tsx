import { features } from "@/config/landing";
import Container from "./Container";
import SectionHeading from "./SectionHeading";

function Features() {
  return (
    <section
      id="features"
      aria-labelledby="features-heading"
      className="scroll-mt-16 py-20 sm:py-28"
    >
      <Container>
        <SectionHeading
          id="features-heading"
          eyebrow="Features"
          title="Everything you need to show up consistently"
          description="Spend less time drafting and switching between apps, and more time running your business."
        />

        <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, description }) => (
            <li
              key={title}
              className="rounded-2xl border border-line bg-surface p-6 transition-shadow hover:shadow-md"
            >
              <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-lg font-semibold">{title}</h3>
              <p className="mt-2 leading-relaxed text-muted">{description}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

export default Features;
