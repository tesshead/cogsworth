import type { DayKey } from './domain/types';

export interface DayConfig {
  key: DayKey;
  label: string;
  date: string; // ISO date, display only
  open: string; // HH:MM
  close: string; // HH:MM
}

export const EVENT_NAME = 'Chattanooga Renaissance Faire';

export const DAYS: readonly DayConfig[] = [
  { key: 'sat', label: 'Saturday', date: '2026-11-14', open: '10:00', close: '20:00' },
  { key: 'sun', label: 'Sunday', date: '2026-11-15', open: '10:00', close: '17:00' },
];

export const SLOT_MIN = 15;
