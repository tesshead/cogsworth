# Cogsworth

Drag-and-drop programming scheduler for the Chattanooga Renaissance Faire (November 14–15, 2026).
Google Sheets is the source of truth; see [docs/design.md](docs/design.md) for the architecture and
data contract.

## Development

Node is pinned with [mise](https://mise.jdx.dev/) (`mise.toml`).

```bash
mise install
npm install
npm run dev        # local dev server
npm test           # unit tests
npm run typecheck
npm run build
```

Until the Apps Script API is connected, the app runs on invented mock data held in memory
(it resets on reload). To try out failure and conflict handling:

- `?mockFailRate=0.5` makes half of all saves fail, so you can watch the retry behaviour.
- In the dev console, `cogsworthMock.externalEdit('barnaby-sat-3', { start_time: '16:00' }, 'Sam')`
  changes a row as if another editor had; your next move of that card gets a conflict notice.

Real Faire data (Sheet exports, import CSVs) belongs in `local/`, which is git-ignored. This repo
is public: never commit performer data, notes, contacts, or the API key.

## Deployment

The site is published to GitHub Pages at **https://tesshead.github.io/cogsworth/** by
`.github/workflows/deploy.yml` on every push to `main`: it runs the tests, builds, and deploys.
A failing test stops the deploy and leaves the previous version live. You can also start a
deploy by hand from the repo's **Actions** tab (Deploy to GitHub Pages → Run workflow).

- The Apps Script URL the site uses is in `.env.production`. It isn't secret. If you ever create
  a *new* Apps Script deployment (rather than a new version of the existing one), update this
  file; for local development, put the same line in `.env.local`.
- The edit key is never in the build. Each editor enters it once in their browser; run
  `setUpEditKey` in the Apps Script editor to rotate it.
- Repo setting (already done once): **Settings → Pages → Build and deployment → Source:
  GitHub Actions**.

See `apps-script/README.md` for setting up and updating the Apps Script side.
