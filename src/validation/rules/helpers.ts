import type { PlacedInstance } from '../../domain/model';
import { formatClock } from '../../domain/time';

export function slot(i: PlacedInstance): string {
  return `${formatClock(i.placement.start)}–${formatClock(i.placement.end)}`;
}

export function occupied(i: PlacedInstance) {
  return { start: i.placement.occStart, end: i.placement.occEnd };
}

export function publicSlot(i: PlacedInstance) {
  return { start: i.placement.start, end: i.placement.end };
}

/** Calls `fn` for every unordered pair within each group. */
export function eachPair<T>(groups: Iterable<T[]>, fn: (a: T, b: T) => void) {
  for (const list of groups) {
    for (let x = 0; x < list.length; x++) {
      for (let y = x + 1; y < list.length; y++) fn(list[x]!, list[y]!);
    }
  }
}

export function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = out.get(k);
    if (list) list.push(item);
    else out.set(k, [item]);
  }
  return out;
}
