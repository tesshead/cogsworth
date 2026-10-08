// Derived views over the model used by the board: Unscheduled groups, chronological card
// numbering, and "what's happening at this time".

import { instanceId } from './ids';
import { dayCap, isContinuous, placedInstances, type Instance, type Model, type PlacedInstance, type RoamingBand } from './model';
import { contains, overlaps } from './time';
import { DAY_KEYS, type Activity, type DayKey } from './types';

export interface UnscheduledGroup {
  activity: Activity;
  day: DayKey;
  /** Cards left to place; null for flexible activities (unlimited). */
  remaining: number | null;
  /** For weekend-count activities: how many are placed across both days. */
  weekendPlaced: number | null;
  /** The instance a drop from this group will place. */
  nextInstanceId: string;
  nextN: number;
}

/** One grouped card per activity with something left to place that day. */
export function unscheduledGroups(model: Model, day: DayKey): UnscheduledGroup[] {
  const groups: UnscheduledGroup[] = [];
  for (const activity of model.activities.values()) {
    if (!activity.active || isContinuous(activity) || activity.durationMin === null) continue;
    const mine = model.instances.filter((i) => i.activity.id === activity.id);

    if (activity.flexibleCount) {
      const n = nextFlexibleN(mine, day);
      groups.push({ activity, day, remaining: null, weekendPlaced: null, nextInstanceId: instanceId(activity.id, day, n), nextN: n });
      continue;
    }

    // Remaining is required minus placed (orphan rows count as placed), capped by open slots.
    const open = mine.filter((i) => i.day === day && i.orphan === null && i.placement === null).sort((a, b) => a.n - b.n);
    const placedToday = mine.filter((i) => i.day === day && i.placement !== null).length;
    let remaining = Math.min(open.length, dayCap(activity, day) - placedToday);
    let weekendPlaced: number | null = null;
    if (activity.weekendCount !== null) {
      weekendPlaced = mine.filter((i) => i.placement !== null).length;
      remaining = Math.min(remaining, activity.weekendCount - weekendPlaced);
    }
    const next = open[0];
    if (remaining > 0 && next) groups.push({ activity, day, remaining, weekendPlaced, nextInstanceId: next.id, nextN: next.n });
  }
  return groups;
}

/** Lowest n with no placement that day, so cleared rows get reused. */
function nextFlexibleN(instances: Instance[], day: DayKey): number {
  const taken = new Set(instances.filter((i) => i.day === day && i.placement !== null).map((i) => i.n));
  let n = 1;
  while (taken.has(n)) n++;
  return n;
}

export interface CardNumber {
  ordinal: number;
  /** Null for flexible activities. */
  of: number | null;
}

/**
 * Chronological number shown on a card ("2/3"). Weekend-count activities number across
 * both days.
 */
export function cardNumber(model: Model, instance: PlacedInstance): CardNumber {
  const { activity } = instance;
  const weekend = activity.weekendCount !== null;
  const peers = placedInstances(model)
    .filter((i) => i.activity.id === activity.id && (weekend || i.day === instance.day))
    .sort((a, b) => DAY_KEYS.indexOf(a.day) - DAY_KEYS.indexOf(b.day) || a.placement.start - b.placement.start || a.n - b.n);
  const ordinal = peers.findIndex((i) => i.id === instance.id) + 1;
  const of = activity.flexibleCount ? null : weekend ? activity.weekendCount : (activity.counts[instance.day] ?? 0);
  return { ordinal, of };
}

export interface HappeningNow {
  instances: PlacedInstance[];
  roaming: RoamingBand[];
}

/**
 * Everything happening at minute `t`. A continuous roamer who is busy with a placed
 * instance at `t` is listed at that instance, not as roaming.
 */
export function happeningAt(model: Model, day: DayKey, t: number): HappeningNow {
  const at = { start: t, end: t + 1 };
  const placed = placedInstances(model, day);
  const instances = placed.filter((i) => overlaps({ start: i.placement.start, end: i.placement.end }, at));
  const busy = new Set(
    placed.filter((i) => overlaps({ start: i.placement.occStart, end: i.placement.occEnd }, at)).map((i) => i.activity.performerId),
  );
  const roaming = model.bands.filter((b) => b.day === day && contains(b, at) && !busy.has(b.activity.performerId));
  return { instances, roaming };
}
