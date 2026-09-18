import type { ReactNode } from "react";
import { env } from "@/config/env";
import Container from "./Container";
import PageIntro from "./PageIntro";

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

interface LegalPageProps {
  title: string;
  /** Shown as "Last updated …". */
  updated: string;
  intro: ReactNode;
  sections: LegalSection[];
}

/** Shared layout for Terms and Privacy: intro, a jump list, then numbered sections. */
function LegalPage({ title, updated, intro, sections }: LegalPageProps) {
  return (
    <>
      <PageIntro eyebrow="Legal" title={title}>
        <p>Last updated {updated}</p>
      </PageIntro>

      <Container className="max-w-3xl py-12 sm:py-16">
        <div className="text-lg leading-relaxed text-ink">{intro}</div>

        <nav aria-labelledby="legal-contents" className="mt-10 rounded-xl border border-line p-5">
          <h2 id="legal-contents" className="text-sm font-semibold">
            On this page
          </h2>
          <ol className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {sections.map((section, index) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="text-muted hover:text-primary">
                  {index + 1}. {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-12 flex flex-col gap-10">
          {sections.map((section, index) => (
            <section key={section.id} id={section.id} className="scroll-mt-20">
              <h2 className="text-xl font-semibold tracking-tight">
                {index + 1}. {section.title}
              </h2>
              <div className="mt-3 flex flex-col gap-3 leading-relaxed text-muted [&_a]:text-primary [&_a]:hover:underline [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-medium [&_strong]:text-ink [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2">
                {section.body}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-14 border-t border-line pt-6 text-sm text-muted">
          Questions about this page? Email us at{" "}
          <a href={`mailto:${env.supportEmail}`} className="text-primary hover:underline">
            {env.supportEmail}
          </a>
          .
        </p>
      </Container>
    </>
  );
}

export default LegalPage;
