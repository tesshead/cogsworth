import { placedInstances } from '../../domain/model';
import type { Rule, Warning } from '../types';
import { groupBy } from './helpers';

/** Gap between consecutive same-performer appearances (occupied times) on a day. */
export const minBreak: Rule = (model) => {
  const warnings: Warning[] = [];
  const groups = groupBy(placedInstances(model), (i) => `${i.day}|${i.activity.performerId}`);
  for (const list of groups.values()) {
    const sorted = [...list].sort((a, b) => a.placement.occStart - b.placement.occStart);
    for (let k = 1; k < sorted.length; k++) {
      const prev = sorted[k - 1]!;
      const next = sorted[k]!;
      const required = Math.max(prev.activity.minBreakMin ?? 0, next.activity.minBreakMin ?? 0);
      const gap = next.placement.occStart - prev.placement.occEnd;
      if (required === 0 || gap < 0 || gap >= required) continue; // overlaps are performer-overlap's job
      warnings.push({
        code: 'min-break',
        severity: 'warn',
        day: next.day,
        instanceIds: [prev.id, next.id],
        activityIds: [prev.activity.id, next.activity.id],
        message: `Only ${gap} min between ${prev.activity.name} and ${next.activity.name}; needs ${required}`,
      });
    }
  }
  return warnings;
};
