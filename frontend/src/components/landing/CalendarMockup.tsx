import { type PlatformName, platformColor } from "@/config/landing";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

const SCHEDULE: { day: number; time: string; platform: PlatformName; title: string }[] = [
  { day: 0, time: "9:00", platform: "LinkedIn", title: "Spring update" },
  { day: 0, time: "12:30", platform: "Instagram", title: "Behind the scenes" },
  { day: 1, time: "10:00", platform: "TikTok", title: "Feature in 30s" },
  { day: 2, time: "8:30", platform: "Facebook", title: "Customer tips" },
  { day: 2, time: "18:00", platform: "Instagram", title: "Team spotlight" },
  { day: 3, time: "9:00", platform: "LinkedIn", title: "We're hiring" },
  { day: 3, time: "17:00", platform: "YouTube", title: "Product walkthrough" },
];

/** Illustrative work-week calendar for the showcase section. */
function CalendarMockup() {
  return (
    <div
      role="img"
      aria-label="Weekly content calendar with posts scheduled across LinkedIn, Instagram, Facebook, TikTok and YouTube"
      className="rounded-2xl border border-line bg-surface p-4 shadow-xl ring-1 shadow-slate-900/5 ring-black/5 sm:p-5"
    >
      <div className="flex items-center justify-between">
        <p className="font-semibold">This week</p>
        <p className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
          {SCHEDULE.length} posts
        </p>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-5">
        {DAYS.map((day, dayIndex) => {
          const posts = SCHEDULE.filter((post) => post.day === dayIndex);
          return (
            <div
              key={day}
              className="flex gap-2 rounded-lg bg-slate-50 p-2 sm:min-h-48 sm:flex-col"
            >
              <p className="w-9 shrink-0 pt-1 text-xs font-semibold text-muted sm:w-auto sm:pt-0">
                {day}
              </p>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                {posts.length === 0 && (
                  <p className="rounded-md border border-dashed border-line px-2 py-1.5 text-xs text-muted">
                    Open slot
                  </p>
                )}
                {posts.map((post) => (
                  <div
                    key={`${post.day}-${post.time}`}
                    className="rounded-md border-l-[3px] bg-surface px-2 py-1.5 shadow-sm"
                    style={{ borderLeftColor: platformColor(post.platform) }}
                  >
                    <p className="text-[11px] text-muted">{post.time}</p>
                    <p className="line-clamp-2 text-xs leading-snug font-medium">{post.title}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default CalendarMockup;
