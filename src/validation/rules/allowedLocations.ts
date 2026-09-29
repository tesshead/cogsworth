import { placedInstances } from '../../domain/model';
import type { Rule, Warning } from '../types';

/** required-location (error) and preferred-location (info), from allowed_locations + location_rule. */
export const allowedLocations: Rule = (model) => {
  const warnings: Warning[] = [];
  for (const i of placedInstances(model)) {
    const { allowedLocations: allowed, locationRule } = i.activity;
    if (allowed.length === 0 || allowed.includes(i.placement.locationId)) continue;
    const names = allowed.map((id) => model.locations.get(id)?.name ?? id).join(' or ');
    const here = model.locations.get(i.placement.locationId)?.name ?? i.placement.locationId;
    const required = locationRule === 'required';
    warnings.push({
      code: required ? 'required-location' : 'preferred-location',
      severity: required ? 'error' : 'info',
      day: i.day,
      instanceIds: [i.id],
      activityIds: [i.activity.id],
      message: required
        ? `${i.activity.name} must be at ${names}, not ${here}`
        : `${i.activity.name} prefers ${names} (placed at ${here})`,
    });
  }
  return warnings;
};
