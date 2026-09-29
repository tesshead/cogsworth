import { DAY_KEYS } from '../../domain/types';
import { activityStatuses } from '../status';
import type { Rule, Warning } from '../types';

const DAY_LABEL = { sat: 'Saturday', sun: 'Sunday' } as const;

/** under-scheduled, over-scheduled, and orphan rows (unknown or inactive activity). */
export const counts: Rule = (model) => {
  const warnings: Warning[] = [];

  for (const s of activityStatuses(model)) {
    const ids = [s.activity.id];
    if (s.weekend) {
      const { placed, required } = s.weekend;
      if (s.state === 'under' || s.state === 'over') {
        warnings.push({
          code: s.state === 'under' ? 'under-scheduled' : 'over-scheduled',
          severity: 'warn',
          day: null,
          instanceIds: [],
          activityIds: ids,
          message: `${s.activity.name}: ${placed} of ${required} placed this weekend`,
        });
      }
      continue;
    }
    for (const day of DAY_KEYS) {
      const { placed, required } = s.days[day];
      if (required === null || placed === required) continue;
      warnings.push({
        code: placed < required ? 'under-scheduled' : 'over-scheduled',
        severity: 'warn',
        day,
        instanceIds: [],
        activityIds: ids,
        message: `${s.activity.name}: ${placed} of ${required} placed on ${DAY_LABEL[day]}`,
      });
    }
  }

  for (const i of model.instances) {
    if (i.placement === null || (i.orphan !== 'inactive-activity' && i.orphan !== 'continuous-activity')) continue;
    warnings.push({
      code: 'orphan',
      severity: 'warn',
      day: i.day,
      instanceIds: [i.id],
      activityIds: [i.activity.id],
      message:
        i.orphan === 'inactive-activity'
          ? `${i.activity.name} is inactive but still placed`
          : `${i.activity.name} is continuous roaming but has a placed row`,
    });
  }
  for (const row of model.unknownRows) {
    if (row.locationId === null) continue;
    warnings.push({
      code: 'orphan',
      severity: 'warn',
      day: row.day,
      instanceIds: [row.id],
      activityIds: [],
      message: `Schedule row ${row.id} refers to unknown activity "${row.activityId}"`,
    });
  }
  return warnings;
};
