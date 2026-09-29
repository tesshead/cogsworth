import { placedInstances } from '../../domain/model';
import type { Rule, Warning } from '../types';

export const missingCapability: Rule = (model) => {
  const warnings: Warning[] = [];
  for (const i of placedInstances(model)) {
    const location = model.locations.get(i.placement.locationId);
    if (!location) continue;
    const missing = i.activity.requires.filter((cap) => !location.provides.includes(cap));
    if (missing.length === 0) continue;
    warnings.push({
      code: 'missing-capability',
      severity: 'warn',
      day: i.day,
      instanceIds: [i.id],
      activityIds: [i.activity.id],
      message: `${i.activity.name} requires ${missing.join(', ')}; ${location.name} doesn't provide it`,
    });
  }
  return warnings;
};
