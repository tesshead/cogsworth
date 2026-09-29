// Typed records parsed from the Scheduler_* tabs. See docs/design.md §2.
// All times are minutes since midnight.

export type DayKey = 'sat' | 'sun';
export const DAY_KEYS: readonly DayKey[] = ['sat', 'sun'];

export type ActivityKind = 'stage' | 'dedicated' | 'ambient' | 'roaming' | 'event';
export const ACTIVITY_KINDS: readonly ActivityKind[] = ['stage', 'dedicated', 'ambient', 'roaming', 'event'];

export type LocationType = 'stage' | 'dedicated' | 'ambient' | 'roaming';
export const LOCATION_TYPES: readonly LocationType[] = ['stage', 'dedicated', 'ambient', 'roaming'];

export type LocationRule = 'required' | 'preferred';
export const LOCATION_RULES: readonly LocationRule[] = ['required', 'preferred'];

export type PerDay<T> = Record<DayKey, T>;

export interface Availability {
  from: number | null;
  until: number | null;
}

export interface Activity {
  id: string;
  performerId: string;
  name: string;
  kind: ActivityKind;
  counts: PerDay<number | null>;
  weekendCount: number | null;
  flexibleCount: boolean;
  continuousDays: DayKey[];
  durationMin: number | null;
  setupMin: number;
  breakdownMin: number;
  availability: PerDay<Availability>;
  minBreakMin: number | null;
  allowedLocations: string[];
  locationRule: LocationRule;
  requires: string[];
  tags: string[];
  parentEvent: string | null;
  notes: string;
  active: boolean;
}

export interface Hours {
  open: number | null;
  close: number | null;
}

export interface Location {
  id: string;
  name: string;
  type: LocationType;
  hours: PerDay<Hours>;
  provides: string[];
  active: boolean;
  notes: string;
}

export interface ScheduleRow {
  id: string;
  activityId: string;
  day: DayKey;
  performanceNo: number;
  locationId: string | null;
  start: number | null;
  durationMin: number | null;
  locked: boolean;
  notes: string;
  rev: number;
  updatedAt: string;
  updatedBy: string;
}

export type SheetTab = 'activities' | 'locations' | 'schedule';

export interface DataIssue {
  tab: SheetTab;
  row: string; // id, or "row N" when the id is missing
  field?: string;
  message: string;
}
