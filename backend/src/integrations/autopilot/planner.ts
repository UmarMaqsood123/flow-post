/**
 * Works out which posting times Autopilot uses. Pure: the same settings and
 * week always give the same times, so re-planning never moves a slot.
 */
import { AUTOPILOT_WEEKDAYS, type AutopilotWeekdayValue } from "../../constants/autopilot.constant";
import {
  addDays,
  localParts,
  mondayOf,
  weekdayOf,
  zonedTimeToUtc,
} from "../../utils/timezone.util";

export interface PlanInput {
  postingDays: AutopilotWeekdayValue[];
  postingTimes: string[];
  postsPerWeek: number;
  timeZone: string;
}

export interface PlannedTime {
  scheduledAt: Date;
  localDay: string;
  weekStart: string;
}

/** Our weekday names start at Monday; `weekdayOf` counts from Sunday. */
const nameOf = (day: string): AutopilotWeekdayValue => AUTOPILOT_WEEKDAYS[(weekdayOf(day) + 6) % 7];

/**
 * Every posting day and time in one week, spread evenly down to `postsPerWeek`.
 * With Tuesday and Thursday at 09:00 and 17:00 and two posts a week, that's
 * Tuesday 09:00 and Thursday 09:00 rather than both on Tuesday.
 */
export const timesForWeek = (weekStart: string, input: PlanInput): PlannedTime[] => {
  const times = [...new Set(input.postingTimes)].sort();
  const candidates: PlannedTime[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const day = addDays(weekStart, offset);
    if (!input.postingDays.includes(nameOf(day))) continue;
    for (const time of times) {
      candidates.push({
        scheduledAt: zonedTimeToUtc(day, time, input.timeZone),
        localDay: day,
        weekStart,
      });
    }
  }
  const wanted = Math.min(input.postsPerWeek, candidates.length);
  if (wanted === candidates.length) return candidates;
  return Array.from(
    { length: wanted },
    (_, index) => candidates[Math.floor((index * candidates.length) / wanted)],
  );
};

/** Planned times strictly after `from` and no later than `to`. */
export const plannedTimes = (input: PlanInput, from: Date, to: Date): PlannedTime[] => {
  const lastWeek = mondayOf(localParts(to, input.timeZone).day);
  const result: PlannedTime[] = [];
  for (
    let week = mondayOf(localParts(from, input.timeZone).day);
    week <= lastWeek;
    week = addDays(week, 7)
  ) {
    for (const time of timesForWeek(week, input)) {
      if (time.scheduledAt > from && time.scheduledAt <= to) result.push(time);
    }
  }
  return result;
};

/**
 * Picks the option used least recently, so pillars and formats rotate. `history`
 * is newest first; options never used come first, in the order configured.
 */
export const leastRecentlyUsed = <T extends string>(
  options: T[],
  history: (T | null)[],
): T | null => {
  if (options.length === 0) return null;
  let best = options[0];
  let bestIndex = -2;
  for (const option of options) {
    const index = history.indexOf(option);
    if (index === -1) return option;
    if (index > bestIndex) {
      best = option;
      bestIndex = index;
    }
  }
  return best;
};
