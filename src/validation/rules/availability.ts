import { placedInstances } from '../../domain/model';
import { formatClock } from '../../domain/time';
import type { Rule, Warning } from '../types';
import { slot } from './helpers';

export const availability: Rule = (model) => {
  const warnings: Warning[] = [];
  for (const i of placedInstances(model)) {
    const { from, until } = i.activity.availability[i.day];
    const early = from !== null && i.placement.start < from;
    const late = until !== null && i.placement.end > until;
    if (!early && !late) continue;
    const window = `${from !== null ? formatClock(from) : 'open'}–${until !== null ? formatClock(until) : 'close'}`;
    warnings.push({
      code: 'performer-availability',
      severity: 'warn',
      day: i.day,
      instanceIds: [i.id],
      activityIds: [i.activity.id],
      message: `${i.activity.name} (${slot(i)}) is outside their availability (${window})`,
    });
  }
  return warnings;
};
