import { placedInstances } from '../../domain/model';
import { overlaps } from '../../domain/time';
import type { Rule, Warning } from '../types';
import { eachPair, groupBy, occupied, slot } from './helpers';

/** Same people in two places at once. Continuous-roaming bands are not instances, so they never count. */
export const performerOverlap: Rule = (model) => {
  const warnings: Warning[] = [];
  const groups = groupBy(placedInstances(model), (i) => `${i.day}|${i.activity.performerId}`).values();
  eachPair(groups, (a, b) => {
    if (!overlaps(occupied(a), occupied(b))) return;
    const where = (i: typeof a) => model.locations.get(i.placement.locationId)?.name ?? i.placement.locationId;
    warnings.push({
      code: 'performer-overlap',
      severity: 'error',
      day: a.day,
      instanceIds: [a.id, b.id],
      activityIds: [a.activity.id, b.activity.id],
      message: `${a.activity.name} at ${where(a)} (${slot(a)}) and ${b.activity.name} at ${where(b)} (${slot(b)}) need the same performer`,
    });
  });
  return warnings;
};
