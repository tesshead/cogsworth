// Invented data shaped like the real Sheet, for local development. Every name here is made up:
// never put real Faire data in this repo.
//
// It deliberately includes one of each interesting case: a fire act on an unsafe stage, a
// required-location violation, setup buffers colliding, a feast with a child performance, a
// performer double-booked across activities, continuous roamers, weekend and flexible counts,
// an over-scheduled orphan row, and a couple of bad cells.

import type { RawRow } from '../domain/parse';

const loc = (id: string, name: string, type: string, extra: RawRow = {}): RawRow => ({ id, name, type, ...extra });

export const MOCK_LOCATIONS: RawRow[] = [
  loc('main-stage', "Lion's Gate Stage", 'Stage', { provides: 'power, fire-safe' }),
  loc('hill-stage', 'Hilltop Stage', 'Stage', { provides: 'fire-safe' }),
  loc('glen', 'Fern Glen', 'Stage', { sat_open: '11:00', sun_open: '11:00', notes: 'Farther in; programming starts at 11.' }),
  loc('gate', 'Front Gate', 'Ambient'),
  loc('tilt-yard', 'Tilt Yard', 'Dedicated'),
  loc('great-hall', 'Great Hall', 'Dedicated'),
  loc('tea-garden', 'Tea Garden', 'Dedicated'),
  loc('lanes', 'Lanes', 'Roaming'),
];

const act = (id: string, name: string, kind: string, extra: RawRow = {}): RawRow => ({ id, name, kind, ...extra });

export const MOCK_ACTIVITIES: RawRow[] = [
  act('gilded-lutes', 'The Gilded Lutes', 'stage', { sat_count: '3', sun_count: '3', duration_min: '30', tags: 'sound' }),
  act('barnaby', "Brother Barnaby's Tales", 'stage', { sat_count: '3', sun_count: '3', duration_min: '45', min_break_min: '30' }),
  act('ember-circus', 'Ember Circus', 'stage', { sat_count: '3', sun_count: '3', duration_min: '30', requires: 'fire-safe', tags: 'fire, sound' }),
  act('punch-pottle', 'Punch & Pottle', 'stage', {
    sat_count: '2', sun_count: '2', duration_min: '30', allowed_locations: 'glen', location_rule: 'required',
  }),
  act('owls', 'Owls of the Wood', 'stage', {
    sat_count: '2', sun_count: '2', duration_min: '30', allowed_locations: 'hill-stage, glen', location_rule: 'preferred', tags: 'animal',
  }),
  act('silk-sisters', 'Silk Sisters Aerial', 'stage', {
    sat_count: '1', sun_count: '1', duration_min: '15', setup_min: '15', breakdown_min: '15', tags: 'aerial',
  }),
  act('rhyme-reason', 'Rhyme & Reason', 'stage', { weekend_count: '2', duration_min: '40', tags: 'sound', notes: 'Prefers Saturday evening.' }),
  act('welcome-minstrels', 'Welcome Minstrels', 'ambient', { weekend_count: '1', duration_min: '60' }),
  act('iron-rose', 'Order of the Iron Rose', 'dedicated', {
    sat_count: '3', sun_count: '3', duration_min: '45', allowed_locations: 'tilt-yard', location_rule: 'required', tags: 'weapons',
  }),
  act('royal-feast', 'Royal Feast', 'event', {
    performer_id: 'host-maren', sat_count: '2', sun_count: '2', duration_min: '60', allowed_locations: 'great-hall', location_rule: 'required',
  }),
  act('blades-feast', 'Crossed Blades (Feast)', 'dedicated', {
    performer_id: 'crossed-blades', sat_count: '2', sun_count: '2', duration_min: '60', parent_event: 'royal-feast',
    allowed_locations: 'great-hall', location_rule: 'required', tags: 'weapons',
  }),
  act('blades-demo', 'Crossed Blades Demo', 'dedicated', {
    performer_id: 'crossed-blades', sat_count: '3', sun_count: '2', duration_min: '15', allowed_locations: 'tilt-yard', tags: 'weapons',
  }),
  act('fairy-tea', 'Fairy Tea', 'dedicated', {
    sat_count: '2', sun_count: '2', duration_min: '40', allowed_locations: 'tea-garden', location_rule: 'required',
  }),
  act('hollybrook-morris', 'Hollybrook Morris', 'stage', { flexible_count: 'TRUE', duration_min: '15', tags: 'dance' }),
  act('pip-juggler', 'Pip the Juggler', 'roaming', { continuous: 'sat, sun', notes: 'Breaks as needed.' }),
  act('wren-dulcimer', 'Wren on Dulcimer', 'roaming', { continuous: 'sat, sun', sun_available_from: '11:00' }),
  act('bramble-deer', 'Bramble the Stilt Deer', 'roaming', {
    performer_id: 'tamsin', sat_count: '2', sun_count: '2', duration_min: '60', tags: 'stilts',
  }),
  act('tamsin-tumble', "Tamsin's Tumble", 'stage', { performer_id: 'tamsin', sat_count: '0', sun_count: '1', duration_min: '45' }),
  act('harpers', 'The Harpers', 'stage', { sat_count: 'two', sun_count: '1', duration_min: '30' }),
  act('animal-chat', 'Animal Chat', 'event', { active: 'FALSE', notes: 'Count and length pending.' }),
];

let rev = 0;
const row = (activityId: string, day: 'sat' | 'sun', n: number, locationId: string, start: string, extra: RawRow = {}): RawRow => ({
  id: `${activityId}-${day}-${n}`,
  activity_id: activityId,
  day,
  performance_no: String(n),
  location_id: locationId,
  start_time: start,
  rev: String(++rev),
  updated_by: 'draft-import',
  ...extra,
});
const locked = { locked: 'TRUE' };

export const MOCK_SCHEDULE: RawRow[] = [
  // Saturday
  row('gilded-lutes', 'sat', 1, 'main-stage', '10:00'),
  row('gilded-lutes', 'sat', 2, 'hill-stage', '13:00'),
  row('gilded-lutes', 'sat', 3, 'main-stage', '16:30'),
  row('barnaby', 'sat', 1, 'hill-stage', '10:30'),
  row('barnaby', 'sat', 2, 'main-stage', '12:00'),
  row('barnaby', 'sat', 3, 'glen', '15:00'),
  row('ember-circus', 'sat', 1, 'main-stage', '11:00'),
  row('ember-circus', 'sat', 2, 'glen', '14:00'),
  row('ember-circus', 'sat', 3, 'main-stage', '19:15'),
  row('punch-pottle', 'sat', 1, 'glen', '11:00'),
  row('punch-pottle', 'sat', 2, 'hill-stage', '16:00'),
  row('owls', 'sat', 1, 'glen', '13:00'),
  row('silk-sisters', 'sat', 1, 'hill-stage', '12:00'),
  row('hollybrook-morris', 'sat', 1, 'hill-stage', '11:30'),
  row('hollybrook-morris', 'sat', 2, 'hill-stage', '12:20'),
  row('rhyme-reason', 'sat', 1, 'main-stage', '18:00'),
  row('welcome-minstrels', 'sat', 1, 'gate', '11:00'),
  row('iron-rose', 'sat', 1, 'tilt-yard', '11:30'),
  row('iron-rose', 'sat', 2, 'tilt-yard', '14:30'),
  row('iron-rose', 'sat', 3, 'tilt-yard', '17:30'),
  row('royal-feast', 'sat', 1, 'great-hall', '12:00', locked),
  row('royal-feast', 'sat', 2, 'great-hall', '18:00', locked),
  row('blades-feast', 'sat', 1, 'great-hall', '12:00', locked),
  row('blades-feast', 'sat', 2, 'great-hall', '18:00', locked),
  row('blades-demo', 'sat', 1, 'tilt-yard', '10:30'),
  row('blades-demo', 'sat', 2, 'tilt-yard', '12:30'),
  row('fairy-tea', 'sat', 1, 'tea-garden', '15:15', locked),
  row('fairy-tea', 'sat', 2, 'tea-garden', '16:30', locked),
  row('bramble-deer', 'sat', 1, 'lanes', '10:30'),
  row('bramble-deer', 'sat', 2, 'lanes', '15:00'),
  // Sunday
  row('gilded-lutes', 'sun', 1, 'main-stage', '10:00'),
  row('gilded-lutes', 'sun', 2, 'glen', '12:00'),
  row('gilded-lutes', 'sun', 4, 'hill-stage', '14:00'),
  row('barnaby', 'sun', 1, 'main-stage', '10:45'),
  row('barnaby', 'sun', 2, 'mian-stage', '13:00'),
  row('ember-circus', 'sun', 1, 'hill-stage', '11:00'),
  row('ember-circus', 'sun', 2, 'main-stage', '14:30'),
  row('royal-feast', 'sun', 1, 'great-hall', '12:00', locked),
  row('royal-feast', 'sun', 2, 'great-hall', '15:30', locked),
  row('blades-feast', 'sun', 1, 'great-hall', '12:00', locked),
  row('blades-feast', 'sun', 2, 'great-hall', '15:30', locked),
  row('fairy-tea', 'sun', 1, 'tea-garden', '12:30', locked),
  row('fairy-tea', 'sun', 2, 'tea-garden', '15:00', locked),
  row('iron-rose', 'sun', 1, 'tilt-yard', '11:15'),
  row('silk-sisters', 'sun', 1, 'glen', '12:00'),
  row('tamsin-tumble', 'sun', 1, 'hill-stage', '15:00'),
  row('bramble-deer', 'sun', 1, 'lanes', '15:15'),
  row('rhyme-reason', 'sun', 1, 'hill-stage', '16:30'),
  row('hollybrook-morris', 'sun', 1, 'main-stage', '16:45'),
];
