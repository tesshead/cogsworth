import type { Model } from '../domain/model';
import { allowedLocations } from './rules/allowedLocations';
import { availability } from './rules/availability';
import { counts } from './rules/counts';
import { kindMismatch } from './rules/kindMismatch';
import { locationHours } from './rules/locationHours';
import { locationOverlap } from './rules/locationOverlap';
import { minBreak } from './rules/minBreak';
import { missingCapability } from './rules/missingCapability';
import { outsideParentEvent } from './rules/outsideParentEvent';
import { performerOverlap } from './rules/performerOverlap';
import type { Rule, Severity, Warning } from './types';

export const RULES: readonly Rule[] = [
  locationOverlap,
  performerOverlap,
  allowedLocations,
  outsideParentEvent,
  missingCapability,
  availability,
  locationHours,
  minBreak,
  counts,
  kindMismatch,
];

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warn: 1, info: 2 };

export function validate(model: Model, rules: readonly Rule[] = RULES): Warning[] {
  return rules.flatMap((rule) => rule(model)).sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
