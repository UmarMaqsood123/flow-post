import type { ReactNode } from "react";
import Container from "./Container";

interface PageIntroProps {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}

/** Heading block at the top of standalone marketing pages (About, Contact, legal). */
function PageIntro({ eyebrow, title, children }: PageIntroProps) {
  return (
    <div className="border-b border-line bg-slate-50">
      <Container className="max-w-3xl py-14 sm:py-20">
        <p className="text-sm font-semibold text-primary">{eyebrow}</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          {title}
        </h1>
        {children && <div className="mt-4 text-lg text-pretty text-muted">{children}</div>}
      </Container>
    </div>
  );
}

export default PageIntro;
