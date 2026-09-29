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

Real Faire data (Sheet exports, import CSVs) belongs in `local/`, which is git-ignored. This repo
is public: never commit performer data, notes, contacts, or the API key.
