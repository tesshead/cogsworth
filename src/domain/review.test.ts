import { describe, expect, it } from 'vitest';
import { activity, makeModel } from '../test/builders';
import type { Acceptance } from './types';
import { reviewItems } from './review';

const acc = (name: string, offer: string, over: Partial<Acceptance> = {}): Acceptance => ({ name, offer, daysAgreed: 'Both Days', confirmed: true, ...over });
const linked = (id: string, acceptance: string, reviewedOffer: string | null, over = {}) =>
  activity(id, { acceptance, reviewedOffer, reviewedDays: 'Both Days', ...over });

describe('reviewItems', () => {
  it('is empty when the Sheet has no Acceptances tab', () => {
    expect(reviewItems(makeModel([linked('a', 'A', 'x')]))).toEqual([]);
  });

  it('is quiet when every linked offer matches its last review, ignoring spacing and case of names', () => {
    const m = makeModel([linked('show', 'washing wenches', 'two  30 min shows ')], [], undefined, [acc('Washing Wenches ', 'two 30 min shows')]);
    expect(reviewItems(m)).toEqual([]);
  });

  it('flags a changed offer once per performer, listing every linked activity', () => {
    const m = makeModel(
      [linked('stage', 'Dandy', 'one show'), linked('barrel', 'Dandy', 'one show')],
      [],
      undefined,
      [acc('Dandy', 'one show and a barrel act')],
    );
    const items = reviewItems(m);
    expect(items.map((i) => [i.kind, i.activities.map((a) => a.id)])).toEqual([['offer-changed', ['stage', 'barrel']]]);
  });

  it('flags changed agreed days and never-reviewed activities', () => {
    const m = makeModel(
      [linked('raptors', 'Raptors', 'two shows'), linked('new', 'Newcomer', null)],
      [],
      undefined,
      [acc('Raptors', 'two shows', { daysAgreed: 'Saturday' }), acc('Newcomer', 'one show')],
    );
    expect(reviewItems(m).map((i) => [i.kind, i.name])).toEqual([
      ['offer-changed', 'Raptors'],
      ['offer-changed', 'Newcomer'],
    ]);
  });

  it('flags unknown links, unlinked confirmed performers, and unconfirmed active ones', () => {
    const m = makeModel(
      [linked('typo', 'Rapturs', 'x'), linked('maybe', 'Maybe Act', 'x'), linked('install', 'Ship', 'x', { active: false })],
      [],
      undefined,
      [acc('Maybe Act', 'x', { confirmed: false }), acc('Ship', 'x'), acc('Forgotten', 'x'), acc('Declined', 'x', { confirmed: false })],
    );
    expect(reviewItems(m).map((i) => [i.kind, i.name])).toEqual([
      ['unknown-acceptance', 'Rapturs'],
      ['not-confirmed', 'Maybe Act'],
      ['not-scheduled', 'Forgotten'],
    ]);
  });
});
