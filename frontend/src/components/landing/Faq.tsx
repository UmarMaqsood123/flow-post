import { ChevronDown } from "lucide-react";
import { faqs } from "@/config/landing";
import Container from "./Container";
import SectionHeading from "./SectionHeading";

function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-heading" className="scroll-mt-16 py-20 sm:py-28">
      <Container className="max-w-3xl">
        <SectionHeading id="faq-heading" eyebrow="FAQ" title="Questions, answered" />

        <div className="mt-12 flex flex-col gap-3">
          {faqs.map((faq) => (
            <details
              key={faq.question}
              className="group rounded-xl border border-line bg-surface px-5 py-4 open:shadow-sm"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                {faq.question}
                <ChevronDown
                  className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <p className="mt-3 leading-relaxed text-muted">{faq.answer}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}

export default Faq;
