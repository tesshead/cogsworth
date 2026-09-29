import { SLOT_MIN } from '../../config';
import { PX_PER_MIN } from '../board/layout';

/**
 * Start time for a drop: where the dragged card's public slot begins relative to the
 * column's top, snapped to the grid and kept within the day.
 */
export function dropStart(opts: { dragTop: number; columnTop: number; dayOpen: number; dayClose: number; setupMin: number }): number {
  const { dragTop, columnTop, dayOpen, dayClose, setupMin } = opts;
  const raw = dayOpen + (dragTop - columnTop) / PX_PER_MIN + setupMin;
  const snapped = Math.round(raw / SLOT_MIN) * SLOT_MIN;
  return Math.min(Math.max(snapped, dayOpen), dayClose - SLOT_MIN);
}
