import { placedInstances, type PlacedInstance } from '../../domain/model';
import { overlaps } from '../../domain/time';
import type { Rule, Warning } from '../types';
import { eachPair, groupBy, occupied, slot } from './helpers';

const EXCLUSIVE_TYPES = new Set(['stage', 'dedicated']);

/** Only an event and an activity declared as part of it (`parent_event`) may share a location. */
function isParentChild(a: PlacedInstance, b: PlacedInstance): boolean {
  return (
    (a.activity.kind === 'event' && b.activity.parentEvent === a.activity.id) ||
    (b.activity.kind === 'event' && a.activity.parentEvent === b.activity.id)
  );
}

export const locationOverlap: Rule = (model) => {
  const warnings: Warning[] = [];
  const exclusive = placedInstances(model).filter((i) => EXCLUSIVE_TYPES.has(model.locations.get(i.placement.locationId)?.type ?? ''));
  const groups = groupBy(exclusive, (i) => `${i.day}|${i.placement.locationId}`).values();
  eachPair(groups, (a, b) => {
    if (!overlaps(occupied(a), occupied(b)) || isParentChild(a, b)) return;
    const location = model.locations.get(a.placement.locationId)!;
    warnings.push({
      code: 'location-overlap',
      severity: 'error',
      day: a.day,
      instanceIds: [a.id, b.id],
      activityIds: [a.activity.id, b.activity.id],
      message: `${a.activity.name} (${slot(a)}) and ${b.activity.name} (${slot(b)}) overlap at ${location.name}`,
    });
  });
  return warnings;
};
