import { CalendarClock, PenLine, ShieldCheck, Users } from "lucide-react";
import { Link } from "react-router";
import Container from "@/components/landing/Container";
import CtaBand from "@/components/landing/CtaBand";
import PageIntro from "@/components/landing/PageIntro";
import { env } from "@/config/env";
import { paths } from "@/routing/paths";

const principles = [
  {
    icon: PenLine,
    title: "You stay in charge",
    description:
      "AI writes the first draft. You decide what gets published, and you can edit every word.",
  },
  {
    icon: Users,
    title: "Built for teams",
    description:
      "Invite editors and reviewers, set roles, and keep approvals in one place instead of a group chat.",
  },
  {
    icon: CalendarClock,
    title: "Consistency over volume",
    description:
      "A steady plan you can keep up with beats a burst of posts followed by three quiet weeks.",
  },
  {
    icon: ShieldCheck,
    title: "Honest about limits",
    description:
      "We tell you exactly what each platform lets us do, so nothing fails without you knowing why.",
  },
];

function About() {
  const app = env.appName;

  return (
    <>
      <PageIntro eyebrow="About" title={`Why we built ${app}`}>
        <p>
          Posting regularly on social media is a lot of work. {app} takes care of the repetitive
          parts so you can spend your time on the business.
        </p>
      </PageIntro>

      <Container className="max-w-3xl py-14 sm:py-20">
        <div className="flex flex-col gap-5 text-lg leading-relaxed text-muted">
          <p>
            Most small teams know they should post more. The hard part isn't ideas. It's turning one
            idea into five versions for five platforms, finding the right time to post each one, and
            remembering to do it again next week.
          </p>
          <p>
            {app} starts with your brand: who you're talking to, how you sound and what you want to
            achieve. From there it suggests a content plan, drafts posts written for each platform,
            and schedules them on one calendar. When a post is ready, it publishes to LinkedIn,
            Instagram, Facebook, TikTok or YouTube for you.
          </p>
          <p>
            We didn't want to build a tool that posts generic filler on your behalf. So nothing goes
            out without your say, unless you choose to turn on Autopilot.
          </p>
        </div>
      </Container>

      <section aria-labelledby="principles-heading" className="border-y border-line bg-slate-50">
        <Container className="py-14 sm:py-20">
          <h2
            id="principles-heading"
            className="text-center text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            What we care about
          </h2>
          <ul className="mt-10 grid gap-5 sm:grid-cols-2">
            {principles.map(({ icon: Icon, title, description }) => (
              <li key={title} className="rounded-2xl border border-line bg-surface p-6">
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-2 leading-relaxed text-muted">{description}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <Container className="max-w-3xl py-14 text-center sm:py-20">
        <h2 className="text-2xl font-semibold tracking-tight">Want to talk?</h2>
        <p className="mt-3 text-lg text-muted">
          We read every message. Questions, feedback and feature ideas are all welcome.
        </p>
        <Link
          to={paths.contact}
          className="mt-4 inline-block font-medium text-primary hover:underline"
        >
          Get in touch
        </Link>
      </Container>

      <CtaBand />
    </>
  );
}

export default About;
