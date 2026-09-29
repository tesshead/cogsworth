// Times are minutes since midnight. The Sheet stores "HH:MM" text, but display values
// may come back as "10:00 AM" or "10:00:00" depending on cell formatting.

const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?$/i;

/** Parses a clock time. Returns null if the text isn't a valid time. */
export function parseTime(text: string): number | null {
  const m = TIME_RE.exec(text.trim());
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = Number(m[2]);
  const meridiem = m[4]?.toLowerCase().replace(/\./g, '');
  if (minutes > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (hours === 12) hours = 0;
    if (meridiem === 'pm') hours += 12;
  } else if (hours > 23) {
    return null;
  }
  return hours * 60 + minutes;
}

/** "HH:MM", the storage format. */
export function formatTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "1:15 PM", for display. */
export function formatClock(min: number): string {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}

export interface Interval {
  start: number;
  end: number;
}

/** Half-open overlap: touching intervals (a.end === b.start) don't overlap. */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function contains(outer: Interval, inner: Interval): boolean {
  return outer.start <= inner.start && inner.end <= outer.end;
}
