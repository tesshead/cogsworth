// Completeness per activity and performer: "who still isn't fully scheduled?"

import { dayCap, isContinuous, type Instance, type Model } from '../domain/model';
import { DAY_KEYS, type Activity, type DayKey, type PerDay } from '../domain/types';

export type CountState = 'ok' | 'under' | 'over' | 'flexible' | 'continuous';

export interface DayStatus {
  placed: number;
  /** Null when the activity has no per-day requirement (weekend, flexible, continuous). */
  required: number | null;
  firstStart: number | null;
  lastEnd: number | null;
  locationIds: string[];
}

export interface ActivityStatus {
  activity: Activity;
  state: CountState;
  days: PerDay<DayStatus>;
  weekend: { placed: number; required: number } | null;
}

export interface PerformerStatus {
  performerId: string;
  state: CountState;
  activities: ActivityStatus[];
}

const STATE_RANK: Record<CountState, number> = { over: 4, under: 3, ok: 2, flexible: 1, continuous: 0 };

export function activityStatuses(model: Model): ActivityStatus[] {
  const byActivity = new Map<string, Instance[]>();
  for (const inst of model.instances) {
    const list = byActivity.get(inst.activity.id) ?? [];
    list.push(inst);
    byActivity.set(inst.activity.id, list);
  }
  return [...model.activities.values()]
    .filter((a) => a.active)
    .map((activity) => statusFor(activity, byActivity.get(activity.id) ?? []));
}

export function performerStatuses(model: Model): PerformerStatus[] {
  const groups = new Map<string, ActivityStatus[]>();
  for (const s of activityStatuses(model)) {
    const list = groups.get(s.activity.performerId) ?? [];
    list.push(s);
    groups.set(s.activity.performerId, list);
  }
  return [...groups].map(([performerId, activities]) => ({
    performerId,
    activities,
    state: activities.reduce<CountState>((worst, a) => (STATE_RANK[a.state] > STATE_RANK[worst] ? a.state : worst), 'continuous'),
  }));
}

function statusFor(activity: Activity, instances: Instance[]): ActivityStatus {
  const days = {} as PerDay<DayStatus>;
  for (const day of DAY_KEYS) days[day] = dayStatus(activity, day, instances);

  if (isContinuous(activity)) return { activity, state: 'continuous', days, weekend: null };
  if (activity.flexibleCount) return { activity, state: 'flexible', days, weekend: null };

  if (activity.weekendCount !== null) {
    const placed = days.sat.placed + days.sun.placed;
    const overCap = DAY_KEYS.some((d) => days[d].placed > dayCap(activity, d));
    const state = placed > activity.weekendCount || overCap ? 'over' : placed < activity.weekendCount ? 'under' : 'ok';
    return { activity, state, days, weekend: { placed, required: activity.weekendCount } };
  }

  const over = DAY_KEYS.some((d) => days[d].placed > (days[d].required ?? 0));
  const under = DAY_KEYS.some((d) => days[d].placed < (days[d].required ?? 0));
  return { activity, state: over ? 'over' : under ? 'under' : 'ok', days, weekend: null };
}

function dayStatus(activity: Activity, day: DayKey, instances: Instance[]): DayStatus {
  const placed = instances.filter((i) => i.day === day && i.placement !== null).map((i) => i.placement!);
  const perDay = !isContinuous(activity) && !activity.flexibleCount && activity.weekendCount === null;
  return {
    placed: placed.length,
    required: perDay ? (activity.counts[day] ?? 0) : null,
    firstStart: placed.length ? Math.min(...placed.map((p) => p.start)) : null,
    lastEnd: placed.length ? Math.max(...placed.map((p) => p.end)) : null,
    locationIds: [...new Set(placed.map((p) => p.locationId))],
  };
}
