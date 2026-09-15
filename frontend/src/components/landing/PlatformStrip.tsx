import { platforms } from "@/config/landing";
import Container from "./Container";

function PlatformStrip() {
  return (
    <section aria-labelledby="platforms-heading" className="border-y border-line bg-slate-50/70">
      <Container className="flex flex-col items-center gap-5 py-8 md:flex-row md:justify-between">
        <h2 id="platforms-heading" className="text-sm font-medium text-muted">
          Create, schedule and publish for
        </h2>
        <ul className="flex flex-wrap justify-center gap-x-8 gap-y-3">
          {platforms.map((platform) => (
            <li
              key={platform.name}
              className="flex items-center gap-2 text-base font-semibold text-ink"
            >
              <span
                aria-hidden="true"
                className="size-2.5 rounded-full"
                style={{ backgroundColor: platform.color }}
              />
              {platform.name}
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

export default PlatformStrip;
