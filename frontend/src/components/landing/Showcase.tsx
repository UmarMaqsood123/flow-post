import { CircleCheck } from "lucide-react";
import { showcasePoints } from "@/config/landing";
import CalendarMockup from "./CalendarMockup";
import Container from "./Container";
import SectionHeading from "./SectionHeading";

function Showcase() {
  return (
    <section aria-labelledby="showcase-heading" className="py-20 sm:py-28">
      <Container className="grid items-center gap-14 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <SectionHeading
            id="showcase-heading"
            align="left"
            eyebrow="Content calendar"
            title="Your whole week, at a glance"
            description="Know exactly what's going out, where and when, without juggling five different apps."
          />
          <ul className="mt-8 flex flex-col gap-4">
            {showcasePoints.map((point) => (
              <li key={point} className="flex gap-3">
                <CircleCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>

        <CalendarMockup />
      </Container>
    </section>
  );
}

export default Showcase;
