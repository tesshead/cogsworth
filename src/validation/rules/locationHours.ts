import { placedInstances } from '../../domain/model';
import { formatClock } from '../../domain/time';
import type { Rule, Warning } from '../types';
import { slot } from './helpers';

export const locationHours: Rule = (model) => {
  const warnings: Warning[] = [];
  for (const i of placedInstances(model)) {
    const location = model.locations.get(i.placement.locationId);
    if (!location) continue;
    const open = location.hours[i.day].open ?? model.days[i.day].open;
    const close = location.hours[i.day].close ?? model.days[i.day].close;
    if (i.placement.start >= open && i.placement.end <= close) continue;
    warnings.push({
      code: 'location-hours',
      severity: 'warn',
      day: i.day,
      instanceIds: [i.id],
      activityIds: [i.activity.id],
      message: `${i.activity.name} (${slot(i)}) is outside ${location.name} hours (${formatClock(open)}–${formatClock(close)})`,
    });
  }
  return warnings;
};
