import type { Severity, Warning } from '../validation/types';

export interface InstanceWarnings {
  worst: Severity | null;
  /** Errors + warns; info-level notes don't count toward the card badge. */
  count: number;
  warnings: Warning[];
}

const RANK: Record<Severity, number> = { error: 3, warn: 2, info: 1 };

export function indexWarnings(warnings: Warning[]): Map<string, InstanceWarnings> {
  const index = new Map<string, InstanceWarnings>();
  for (const w of warnings) {
    for (const id of w.instanceIds) {
      const entry = index.get(id) ?? { worst: null, count: 0, warnings: [] };
      entry.warnings.push(w);
      if (w.severity !== 'info') entry.count++;
      if (!entry.worst || RANK[w.severity] > RANK[entry.worst]) entry.worst = w.severity;
      index.set(id, entry);
    }
  }
  return index;
}
