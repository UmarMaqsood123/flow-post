import type { CreatePlatform, PostStatus } from "@/types/post";

/** What the calendar is filtered by. Empty lists mean "everything". */
export interface CalendarFilterState {
  platforms: CreatePlatform[];
  statuses: PostStatus[];
  pillars: string[];
}

export const emptyFilters = (): CalendarFilterState => ({
  platforms: [],
  statuses: [],
  pillars: [],
});

export const countFilters = (filters: CalendarFilterState) =>
  filters.platforms.length + filters.statuses.length + filters.pillars.length;
