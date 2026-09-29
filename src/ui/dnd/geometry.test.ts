import { describe, expect, it } from 'vitest';
import { dropStart } from './geometry';

// 20px per 15 minutes: 1 minute = 4/3 px.
const base = { columnTop: 100, dayOpen: 600, dayClose: 1200, setupMin: 0 };

describe('dropStart', () => {
  it('snaps to the nearest 15 minutes', () => {
    expect(dropStart({ ...base, dragTop: 100 })).toBe(600);
    expect(dropStart({ ...base, dragTop: 100 + 80 * 1.5 })).toBe(690); // 90 min
    expect(dropStart({ ...base, dragTop: 100 + 8 })).toBe(600); // 6 min rounds down
    expect(dropStart({ ...base, dragTop: 100 + 12 })).toBe(615); // 9 min rounds up
  });

  it('accounts for the setup buffer above the card', () => {
    expect(dropStart({ ...base, setupMin: 15, dragTop: 100 + 80 })).toBe(675);
  });

  it('keeps the start within the day', () => {
    expect(dropStart({ ...base, dragTop: 0 })).toBe(600);
    expect(dropStart({ ...base, dragTop: 5000 })).toBe(1185);
  });
});
