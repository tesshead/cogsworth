import type { DayKey } from './types';

/**
 * Stable instance id, also the Scheduler_Schedule row id. Built, never parsed:
 * activity ids contain hyphens.
 */
export function instanceId(activityId: string, day: DayKey, n: number): string {
  return `${activityId}-${day}-${n}`;
}
