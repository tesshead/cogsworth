import { placedInstances } from '../../domain/model';
import type { Rule, Warning } from '../types';

export const kindMismatch: Rule = (model) => {
  const warnings: Warning[] = [];
  for (const i of placedInstances(model)) {
    const location = model.locations.get(i.placement.locationId);
    if (!location || i.activity.kind === 'event' || i.activity.kind === location.type) continue;
    warnings.push({
      code: 'kind-mismatch',
      severity: 'info',
      day: i.day,
      instanceIds: [i.id],
      activityIds: [i.activity.id],
      message: `${i.activity.name} is a ${i.activity.kind} activity placed at ${location.name} (${location.type})`,
    });
  }
  return warnings;
};
