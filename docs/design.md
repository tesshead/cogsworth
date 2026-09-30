# Cogsworth — design

Cogsworth is the drag-and-drop programming scheduler for the Chattanooga Renaissance Faire,
November 14–15, 2026. It is an internal operational tool for one two-day event, not a generic
scheduling product.

- Saturday, Nov 14: 10:00–20:00
- Sunday, Nov 15: 10:00–17:00

Google Sheets is the source of truth. The frontend is a static React app. An Apps Script web
app sits between them.

```
Google Sheet (Scheduler_* tabs)
   ↕  SpreadsheetApp (bound script, @OnlyCurrentDoc)
Apps Script web app — auth check, read tabs, validated patch writes under LockService
   ↕  HTTPS POST, text/plain body containing JSON
Static SPA (GitHub Pages) — domain logic, validation, drag/drop, optimistic state, sync queue
```

The server only stores data. All scheduling logic lives in pure TypeScript on the client, where
it is unit-tested.

> **No real Faire data in this repo.** The repo is public. Performer rows, notes, contacts, and
> the draft schedule live in the Google Sheet. Tests use synthetic fixtures. Local exports go in
> `local/` (git-ignored).

---

## 1. Concepts

| Term | Meaning |
|---|---|
| **Activity** | One schedulable kind of thing: a stage show, a roaming set, an arena match, a feast, a tea. One performer can have several activities (for example a stage show and a barrel act). |
| **Performer / conflict identity** | `performer_id`. Activities sharing it involve the same people and must not overlap. It may span separately booked acts, and it may name an event host. |
| **Instance** | One required or placed occurrence of an activity on a day: `${activity_id}-${day}-${n}`. IDs are built, never parsed. |
| **Placement** | An instance with a `location_id` and a `start_time`. Unscheduling clears both and keeps the row. |
| **Location** | A place things happen. Its `type` controls how it renders and whether overlaps there are conflicts. |
| **Event** | Programming that isn't a performer appearance (feast, teas, workshops). It renders as a band. Only activities that declare it as their `parent_event` may overlap it in its location. Usually locked. |
| **Continuous roaming** | Open-to-close roaming with no discrete sets. It renders as a background band across the activity's availability window. It creates no instances, cards, counts or Schedule rows. The same performer's discrete shows carve through it without a conflict. |

Day keys are `sat` and `sun` everywhere. Times are minutes since midnight in code and `HH:MM`
(24-hour) plain text in the Sheet.

## 2. Sheet contract

Every tab is read by **header name**, so column order doesn't matter and extra columns are
ignored. The server reads with `getDisplayValues()`. The client parses and reports bad cells in a
"Data issues" panel instead of failing.

Common parsing rules:

- Booleans accept `TRUE`, `yes`, `x` and `1`. Blank is false, except `active`, where blank is true.
- Lists are comma-separated.
- Times may be `HH:MM` or `h:mm AM/PM`.

### Scheduler_Activities

| Column | Type | Semantics |
|---|---|---|
| `id` | kebab-case | Immutable. Changing it orphans that activity's schedule rows. |
| `performer_id` | kebab-case | Conflict identity. Blank means `id`. |
| `name` | text | Card label. |
| `kind` | `stage` \| `dedicated` \| `ambient` \| `roaming` \| `event` | Unscheduled grouping and the "home" section. |
| `sat_count`, `sun_count` | int | Required instances per day. When `weekend_count` is set, these are per-day **caps** instead (blank cap = `weekend_count`). |
| `weekend_count` | int, optional | Total required across the weekend. |
| `flexible_count` | bool | No required count and no count warnings. Instances exist only as placed rows. The Unscheduled panel offers "place another". |
| `continuous` | list of day keys, optional | Days of continuous roaming, e.g. `sat, sun`. Only valid with `kind=roaming`. It is exclusive with counts: a continuous activity with a count or `flexible_count` is a data issue. The band spans the day's availability window, which defaults to event hours. Breaks go in `notes`. |
| `parent_event` | activity id of an `event`, optional | This activity is intentionally part of that event, e.g. a performer booked for the length of the feast. It only relaxes location-overlap between this activity and that event (see §4). |
| `duration_min` | int | Planned public slot length. |
| `setup_min`, `breakdown_min` | int, optional | The location is occupied before and after the public slot. Rendered hatched. |
| `sat_available_from` … `sun_available_until` | time, optional | Blank means the whole day. The entire public slot must fit. |
| `min_break_min` | int, optional | Minimum gap between this activity and any other activity with the same `performer_id` on the same day. |
| `allowed_locations` | list of location ids | Where this activity belongs. |
| `location_rule` | `required` \| `preferred` | Severity of placing outside `allowed_locations`. Blank means `preferred`. |
| `requires` | list | Capabilities the location must `provide`, e.g. `fire-safe`. |
| `tags` | list | Descriptive only in v1 (`fire`, `weapons`, `animal`, `sound`, `stilts`, `aerial`, …). Shown as card badges; reserved for future calm-perimeter rules. |
| `acceptance` | text, optional | The performer's name as written in the Acceptances tab (case and spacing don't matter). Several activities may share one. Links the activity to its offer for the Review check (§4a). |
| `reviewed_offer`, `reviewed_days` | text | Written by "Mark reviewed": the Acceptances offer and agreed days last checked against this row. Don't edit by hand. |
| `notes` | text | Private operational notes. Never exposed publicly. |
| `active` | bool | Inactive activities generate nothing. Their placed rows become orphans. |

### Scheduler_Locations

The order of rows in this tab is the order of the board columns.

| Column | Semantics |
|---|---|
| `id`, `name` | |
| `type` | `stage` \| `dedicated` \| `ambient` \| `roaming` |
| `sat_open`, `sat_close`, `sun_open`, `sun_close` | Blank means the event hours for that day. |
| `provides` | List, e.g. `power, fire-safe`. Don't record capabilities that haven't been confirmed. |
| `active`, `notes` | |

### Scheduler_Schedule

| Column | Semantics |
|---|---|
| `id` | `${activity_id}-${day}-${performance_no}`. Key for every write. |
| `activity_id`, `day`, `performance_no` | Must match `id`. The server checks this. |
| `location_id`, `start_time` | Both set means placed; both blank means unscheduled. |
| `duration_min` | Optional per-placement override of the activity default. |
| `locked` | Locked cards can't be dragged. Unlocking is one click. |
| `notes` | Private. |
| `rev` | Integer. The server increments it on every write. Used for stale-write detection. |
| `updated_at`, `updated_by` | Set by the server. `updated_by` is a name the editor types once; it is trust-based. Imported rows use `draft-import`. |

## 3. Derived model

1. Parse the three tabs into typed records plus a `DataIssue[]` list.
2. Expand active activities into expected instances:
   - **Fixed count:** `n = 1..count(day)`.
   - **Weekend count:** `n = 1..cap(day)` on each day, but status is measured against `weekend_count` across both days. Once the total is met, the other day's remaining cards drop out of the Unscheduled panel.
   - **Flexible:** the placed rows only. "Place another" uses the next unused `n` for that day.
   - **Continuous:** no instances. Instead, one `RoamingBand {activityId, performerId, day, start, end}` per listed day.
3. Join the expected instances with the Schedule rows by `id`.
4. **Orphans** are rows whose activity is missing or inactive, or whose `n` exceeds the cap. They are shown in "Needs attention" with a clear/delete action.
5. Board numbering is chronological among an activity's placed instances that day ("2/3"). Stable IDs stay internal.

## 4. Validation

Rules are pure functions `(ctx) => Warning[]`, one file each. **No rule blocks a drop.**

Severities:

- **error** (red): almost certainly wrong.
- **warn** (amber): needs a decision.
- **info** (grey): FYI.

| Rule | Severity | Definition |
|---|---|---|
| location-overlap | error | Same location, occupied intervals overlap (including setup and breakdown). Applies only to `stage` and `dedicated` locations. **The only exempt pair** is an event and an activity whose `parent_event` is that event's activity. Unrelated performances overlapping an event are errors, and so are two children of the same event overlapping each other. |
| performer-overlap | error | Same `performer_id`, occupied intervals overlap, any location. It applies to parent/child pairs too. Continuous-roaming bands never take part; performing inside a roaming window is expected. |
| outside-parent-event | warn | A child is placed where no instance of its `parent_event` at the same location fully contains its public slot, e.g. the feast moved but the performer didn't. |
| required-location | error | `location_rule=required` and placed outside `allowed_locations`. |
| missing-capability | warn | The location doesn't `provide` something in `requires`. |
| performer-availability | warn | The public slot falls outside the activity's availability window. |
| location-hours | warn | The public slot falls outside the location's hours. |
| min-break | warn | Gap to the next same-performer instance is below the larger `min_break_min` of the two. |
| under-scheduled | warn | Fewer placed than required (per day, or across the weekend for `weekend_count`). |
| over-scheduled / orphan | warn | More placed than required, or an orphan row. |
| preferred-location | info | `location_rule=preferred` and placed outside `allowed_locations`. |
| kind-mismatch | info | Activity `kind` differs from location `type`, e.g. roaming placed on a stage. `event` is exempt. |

Deferred rules, which will need a `Scheduler_Constraints` tab and `tags`:

- calm perimeter / quiet zones (live-animal shows),
- avoid-overlap pairs,
- staggered stage starts,
- clustering,
- preferred times.

## 4a. Review against Acceptances

Scheduling facts live only in `Scheduler_Activities`; the free-text Offer column can't be parsed
reliably, and most scheduling facts aren't in Acceptances at all. Instead, Cogsworth watches the
Acceptances tab (read-only: the script returns only name, offer, days agreed and confirmed; never
contacts or fees) and lists what needs attention in a Review panel:

| Item | When |
|---|---|
| offer-changed | A linked Acceptances row's offer or agreed days differ from `reviewed_offer` / `reviewed_days` (or the row was never reviewed). "Mark reviewed" copies the current values from the Sheet. |
| unknown-acceptance | An activity's `acceptance` matches no Acceptances row. |
| not-scheduled | A confirmed Acceptances row has no linked activity. Installations get a linked `active = FALSE` row to silence this. |
| not-confirmed | An active linked activity's Acceptances row isn't confirmed. |

Activities without `acceptance` (feasts, teas, workshops) are ignored. No Acceptances tab means
no review items.

## 5. API

`POST <exec URL>` with `Content-Type: text/plain;charset=utf-8` and a JSON body. Every response
is HTTP 200 with a JSON envelope: `{ok:true,…}` or
`{ok:false, error:{code:"unauthorized"|"bad_request"|"server_error", message}}`.

```jsonc
// load
{ "action": "load", "key": "…" }
→ { "ok": true, "serverTime": "…", "activities": [ {header: displayValue} ], "locations": [...], "schedule": [...] }

// save — a batch of patches, one result per change
{ "action": "save", "key": "…", "updatedBy": "Tess",
  "changes": [
    { "id": "x-sat-2", "activity_id": "x", "day": "sat", "performance_no": 2, "base_rev": 4,
      "set": { "location_id": "sword-song", "start_time": "13:15" } },  // any of: location_id, start_time, duration_min, locked, notes; null clears
    { "id": "old-sun-3", "base_rev": 2, "delete": true }                // orphan cleanup only
  ] }
→ { "ok": true, "results": [ { "id": "…", "status": "ok" | "conflict" | "error", "row": {…}, "message": "…" } ] }

// review — copy current Acceptances offer/days into reviewed_offer/reviewed_days
{ "action": "review", "key": "…", "activityIds": ["dandy-stage", "dandy-barrel"] }
→ { "ok": true, "results": [ { "id": "…", "status": "ok" | "error", "message": "…" } ] }
```

`load` also returns `acceptances`: `[{ name, offer, days_agreed, confirmed }]`, or `null` when
there is no Acceptances tab.

The server:

- takes a script lock for each save;
- finds rows by `id`, never by row number;
- checks `base_rev` (0 means the row isn't expected to exist yet);
- validates ids, day, time format, and that the referenced activity and location exist;
- writes times and notes as plain text, so a note starting with `=` can't become a formula;
- does **not** enforce scheduling rules.

## 6. Client state and sync

- `state/reducer.ts` is pure. Its actions are `move`, `unschedule`, `setDuration`, `setLocked`, `setNotes`, `applyServerRows`, `undo` and `redo`.
- Undo re-applies the previous placement through the same save path.
- **Sync queue:**
  - one request in flight at a time;
  - patches for the same instance are merged and sent with the newest known `rev`;
  - failed requests retry with backoff.
- **On conflict:** the server's row wins, and a notice shows who changed it.
- **Staying current:** the app refreshes when the window regains focus and every 60 seconds while visible with nothing waiting to save.
- **Not losing work:** a `beforeunload` guard warns while saves are pending, and a sync indicator shows Saved / Saving n / Failed.
- Warnings are derived with `useMemo` and never stored in state.
- `localStorage` holds only per-viewer conveniences: the key, the editor's name, section toggles and the selected day.

## 7. UI

- **Day tabs:** Saturday and Sunday.
- **Time axis:** 15-minute grid over the event hours.
- **Board sections:**
  - **Stages** are always shown.
  - **Ambient**, **Dedicated/Events** and **Roaming** are toggle chips.
  - Roaming renders one lane per roaming activity. Continuous-roaming bands fill their lane as a background, and the same performer's shows elsewhere are shown as gaps cut out of the band.
- **Cards** show the name, chronological number, duration, badges, lock and warning count. Short cards collapse to one line. Events render as bands behind cards. Setup and breakdown render hatched.
- **Left: Unscheduled panel**, grouped by kind. It has one card per activity with the number left ("2 left"), and "place another" for flexible activities.
- **Right: Status panel**, grouped by performer, one row per activity. It shows the count, the first-to-last time span and the number of stages used, with an "incomplete only" filter. The **Warnings** and **Data issues** panels sit alongside.
- **"At this time" view:** click a time on the axis to list everything happening at that moment across all locations, including continuous-roaming bands. A roamer who is performing at that moment is listed at the show, not as roaming.
- **Card popover:** duration override, notes and lock.

## 8. Source layout

```
src/config.ts            event days, hours, slot size
src/domain/              types, time, ids, parse, model (instances, orphans, bands), views (unscheduled, numbering, at-time)
src/validation/          rules/*, validate, status (completeness per activity and performer)
src/api/                 transport interface; fetchTransport, gasTransport, mockTransport; syncQueue
src/state/               reducer, store
src/ui/                  App, Toolbar, Board (TimeGutter, LocationColumn, PerformanceCard), panels
apps-script/Code.gs      the API; README covers Sheet setup and deployment
scripts/                 one-off import tooling (reads local/ exports; outputs CSV to review)
```

Runtime dependencies: `react`, `react-dom`, `@dnd-kit/core`. Development: Vite, TypeScript,
Vitest.

## 9. Security and deployment

**Main plan: GitHub Pages → Apps Script web app**

- The Apps Script web app runs as the owner, with access set to *Anyone*.
- The exec URL is public, because it's in the bundle. Every action, including `load`, requires a shared **edit key** stored in Script Properties and sent in the POST body. This is a team password, not authentication. Rotate it by changing the property.
- `@OnlyCurrentDoc` limits the script to this spreadsheet.
- There is no per-person audit trail beyond the trust-based `updated_by`.
- **Precondition:** the Google Workspace domain must allow *Anyone* web-app access. Check this before M3.
  1. In the deployment dialog, confirm *Anyone* is offered as an access option.
  2. In a private browser window, confirm the exec URL returns JSON without a sign-in.
  3. Confirm a cross-origin `fetch` from another site returns JSON.

**Fallback if Workspace blocks *Anyone*:** serve a single-file build from Apps Script
(`HtmlService`), set access to *Anyone in the domain*, and call the API with
`google.script.run`. This uses real Google sign-in with no key and no CORS. Only the transport
changes.

**Future public schedule:** a separate unauthenticated action returning only name, location
and time. Notes are never included.

## 10. Initial data import

Import the existing Saturday and Sunday draft grids and the Events workbook into
`Scheduler_Schedule` once. They are the starting point, not a blank board.

- Performer placements import **unlocked**.
- Events with authoritative times, and performances tied to them (for example a performer booked for the length of the feast), import **locked**.
- Draft items known to have been removed are skipped.
- Imported rows get `updated_by = draft-import`.
- Warnings caused by constraints decided after the drafts were made are expected.
- The import is a reviewed CSV pasted into the Sheet, not a permanent feature.

## 11. Milestones

| # | Deliverable |
|---|---|
| M0 | Scaffold: Vite/React/TS, Vitest, `mise.toml`. |
| M1 | `domain/` + `validation/` + `status`, fully unit-tested against synthetic fixtures. |
| M2 | Read-only board on `mockTransport`: sections, bands, the Unscheduled, Status, Warnings and Data-issues panels, and the "at this time" view. |
| M3 | Apps Script `load`/`save` + README. Workspace check. Sheet tabs populated and the draft import applied. |
| M4 | Drag and drop, the sync queue, conflict handling. |
| M5 | Undo/redo, lock, card popover, polling, unload guard. |
| M6 | GitHub Pages workflow and deploy docs (or the HtmlService fallback). |
| Later | Search and filters, printing, `Scheduler_Constraints`, public read-only schedule, export. |
