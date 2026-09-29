import { describe, expect, it } from 'vitest';
import { formatClock, formatTime, overlaps, parseTime } from './time';

describe('parseTime', () => {
  it.each([
    ['10:00', 600],
    ['9:05', 545],
    ['20:00', 1200],
    ['10:00:00', 600],
    ['10:00 AM', 600],
    ['1:15 PM', 795],
    ['12:00 PM', 720],
    ['12:30 AM', 30],
    ['6:00 p.m.', 1080],
  ])('%s → %i', (text, minutes) => {
    expect(parseTime(text)).toBe(minutes);
  });

  it.each(['', 'noon', '24:00', '10:60', '13:00 PM', '10'])('rejects %j', (text) => {
    expect(parseTime(text)).toBeNull();
  });
});

describe('formatting', () => {
  it('formats storage and display times', () => {
    expect(formatTime(545)).toBe('09:05');
    expect(formatClock(545)).toBe('9:05 AM');
    expect(formatClock(720)).toBe('12:00 PM');
    expect(formatClock(1215)).toBe('8:15 PM');
  });
});

describe('overlaps', () => {
  it('treats touching intervals as not overlapping', () => {
    expect(overlaps({ start: 600, end: 630 }, { start: 630, end: 660 })).toBe(false);
    expect(overlaps({ start: 600, end: 631 }, { start: 630, end: 660 })).toBe(true);
  });
});
