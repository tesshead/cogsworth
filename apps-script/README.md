# Cogsworth Apps Script API

`Code.gs` is the whole API: a web app bound to the scheduling Google Sheet. It reads the three
`Scheduler_*` tabs and writes schedule changes. It stores data only; every scheduling rule is a
warning computed by the app. Behaviour is covered by `Code.test.ts` (run with `npm test`), which
runs this file against a fake spreadsheet.

## 1. Prepare the Sheet

Create three tabs with these exact names. The first row of each is the header row; column order
doesn't matter, and extra columns you add are ignored and left alone.

| Tab | Header row |
|---|---|
| `Scheduler_Activities` | `id, performer_id, name, kind, sat_count, sun_count, weekend_count, flexible_count, continuous, duration_min, setup_min, breakdown_min, sat_available_from, sat_available_until, sun_available_from, sun_available_until, min_break_min, allowed_locations, location_rule, requires, tags, parent_event, acceptance, reviewed_offer, reviewed_days, notes, active` |
| `Scheduler_Locations` | `id, name, type, sat_open, sat_close, sun_open, sun_close, provides, active, notes` |
| `Scheduler_Schedule` | `id, activity_id, day, performance_no, location_id, start_time, duration_min, locked, notes, rev, updated_at, updated_by` |

See `docs/design.md` §2 for what each column means.

The script also reads the existing **`Acceptances`** tab, read-only, to power the app's Review
panel (`docs/design.md` §4a). It finds the header row by its "Performer / Stage Name" cell and
returns only the name, Offer, Days Agreed and Confirmed? columns; contacts and fees never leave
the Sheet. If you rename that tab or those headers, the Review panel goes quiet.

- Format time columns (`*_open`, `*_close`, `*_available_*`, `start_time`) as **Plain text**
  (Format → Number → Plain text) so Sheets doesn't turn `10:00` into a date. The script writes
  `start_time` as plain text itself.
- Don't turn `locked` into a checkbox column; the script writes `TRUE`/`FALSE` as text.
- Avoid editing `Scheduler_Schedule` by hand while someone has the app open. Hand edits don't
  bump `rev`, so they're last-write-wins. Editing Activities and Locations is fine; press Refresh
  in the app afterwards.

## 2. Add the script

1. In the Sheet: **Extensions → Apps Script**.
2. Replace the contents of `Code.gs` in the editor with this repo's `apps-script/Code.gs`. Save.
3. In the function menu at the top (next to Run/Debug), choose **`setUpEditKey`** and press
   **Run**. The first time, Google asks for permission:
   - Choose your account.
   - If you see "Google hasn't verified this app", click **Advanced → Go to (project name)
     (unsafe)**. It's your own script; the warning appears for every personal script.
   - Allow access. The script can only reach this one spreadsheet (`@OnlyCurrentDoc`).
4. Open **Execution log** and copy the key it printed. That's the edit key editors type into the
   app. Keep it out of the repo, issues and public chats. Run `setUpEditKey` again any time to
   rotate it (everyone then re-enters the new one).

## 3. Deploy

1. **Deploy → New deployment**. Click the gear next to "Select type" and choose **Web app**.
2. Description: `Cogsworth API`.
3. **Execute as: Me**.
4. **Who has access: Anyone**. The app is a static site calling the script from the browser, so
   the script can't require a Google sign-in; the edit key is what protects it.
5. **Deploy**, then copy the **Web app URL** (ends in `/exec`).

Check it: open the URL in a browser. You should see `{"ok":true,"service":"cogsworth"}`. That GET
returns no schedule data.

## 4. Point the app at it

- Local development: create `.env.local` in the repo root (git-ignored) containing
  `VITE_API_URL=<the /exec URL>`, then `npm run dev`.
- GitHub Pages: see the deployment docs (M6). The URL is not secret; it ends up in the public
  site. Only the edit key is.

## Updating the script later

Paste the new code, save, then **Deploy → Manage deployments → (pencil) Edit → Version: New
version → Deploy**. Editing the existing deployment keeps the same URL; "New deployment" would
create a different one.

## Security, in short

Anyone with the URL can call the API, but every call needs the edit key, and the script can only
touch this spreadsheet. Changes run as the owner's account; `updated_by` is the name each editor
typed, not a verified identity. Rotating the key locks out everyone who has the old one.
