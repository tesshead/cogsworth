import { placedInstances } from '../../domain/model';
import { contains } from '../../domain/time';
import type { Rule, Warning } from '../types';
import { publicSlot, slot } from './helpers';

export const outsideParentEvent: Rule = (model) => {
  const warnings: Warning[] = [];
  const placed = placedInstances(model);
  for (const child of placed) {
    const parentId = child.activity.parentEvent;
    const parent = parentId ? model.activities.get(parentId) : undefined;
    if (!parent || parent.kind !== 'event') continue;
    const inside = placed.some(
      (p) =>
        p.activity.id === parent.id &&
        p.day === child.day &&
        p.placement.locationId === child.placement.locationId &&
        contains(publicSlot(p), publicSlot(child)),
    );
    if (inside) continue;
    warnings.push({
      code: 'outside-parent-event',
      severity: 'warn',
      day: child.day,
      instanceIds: [child.id],
      activityIds: [child.activity.id, parent.id],
      message: `${child.activity.name} (${slot(child)}) is not within a ${parent.name} at the same location`,
    });
  }
  return warnings;
};
