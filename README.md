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
