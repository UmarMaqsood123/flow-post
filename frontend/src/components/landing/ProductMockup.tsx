import { CalendarCheck, Sparkles } from "lucide-react";
import { type PlatformName, platformColor, platforms } from "@/config/landing";
import { cn } from "@/lib/utils";

interface DraftCardProps {
  platform: PlatformName;
  body: string;
  hashtags?: string;
  status: string;
  scheduled?: boolean;
}

function DraftCard({ platform, body, hashtags, status, scheduled = false }: DraftCardProps) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-center gap-2.5">
        <span className="size-8 rounded-full bg-gradient-to-br from-primary to-violet-400" />
        <div className="min-w-0">
          <p className="text-sm leading-tight font-semibold">Your Brand</p>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: platformColor(platform) }}
            />
            {platform}
          </p>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-ink">{body}</p>
      {hashtags && <p className="mt-1.5 text-sm text-primary">{hashtags}</p>}
      <p
        className={cn(
          "mt-3 inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
          scheduled ? "bg-green-50 text-green-700" : "bg-slate-100 text-muted",
        )}
      >
        {status}
      </p>
    </div>
  );
}

/** Illustrative product UI for the hero. Purely decorative — described via aria-label. */
function ProductMockup() {
  return (
    <div
      role="img"
      aria-label="Preview of the FlowPost composer turning one idea into LinkedIn and Instagram posts"
      className="relative mx-auto w-full max-w-xl lg:max-w-none"
    >
      <div className="rounded-2xl border border-line bg-surface shadow-2xl ring-1 shadow-primary/10 ring-black/5">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="size-2.5 rounded-full bg-slate-200" />
          <span className="size-2.5 rounded-full bg-slate-200" />
          <span className="size-2.5 rounded-full bg-slate-200" />
          <span className="ml-3 truncate text-xs font-medium text-muted">FlowPost · Compose</span>
        </div>

        <div className="grid gap-4 p-4 sm:grid-cols-[0.9fr_1.1fr] sm:p-5">
          <div className="flex flex-col gap-4 rounded-xl bg-slate-50 p-4">
            <div>
              <p className="text-xs font-semibold">What do you want to share?</p>
              <p className="mt-2 rounded-lg border border-line bg-surface p-3 text-sm leading-relaxed">
                Announce our spring update: three new features that save teams time.
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-muted">Tone</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {["Friendly", "Professional", "Witty"].map((tone, index) => (
                  <span
                    key={tone}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-medium",
                      index === 0
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-line bg-surface text-muted",
                    )}
                  >
                    {tone}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-muted">Platforms</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {platforms.map((platform, index) => (
                  <span
                    key={platform.name}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border bg-surface px-2 py-1 text-xs",
                      index < 3 ? "border-line text-ink" : "border-dashed border-line text-muted",
                    )}
                  >
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: platform.color }}
                    />
                    {platform.name}
                  </span>
                ))}
              </div>
            </div>

            <span className="mt-auto flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white">
              <Sparkles className="size-4" />
              Generate posts
            </span>
          </div>

          <div className="flex flex-col gap-3">
            <DraftCard
              platform="LinkedIn"
              body="We just shipped our spring update 🌱 Three new features built to give your team hours back every week. Here's what's new…"
              status="Scheduled · Tue 9:00 AM"
              scheduled
            />
            <DraftCard
              platform="Instagram"
              body="Spring cleaning, but for your workflow ✨ Swipe to see what's new."
              hashtags="#productupdate #worksmarter"
              status="Draft · Ready to review"
            />
          </div>
        </div>
      </div>

      <div className="absolute -bottom-6 -left-4 hidden items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-lg sm:flex">
        <span className="flex size-9 items-center justify-center rounded-lg bg-green-50 text-green-700">
          <CalendarCheck className="size-5" />
        </span>
        <div>
          <p className="text-sm font-semibold">5 posts scheduled</p>
          <p className="text-xs text-muted">This week · 3 platforms</p>
        </div>
      </div>
    </div>
  );
}

export default ProductMockup;
