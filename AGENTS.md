# AGENTS.md - grafana-ibmlogs-datasource

## Project Overview

A Grafana datasource plugin that connects Grafana to the IBM Cloud Logs service. Users configure an IBM Cloud Logs endpoint and API key, then query logs using Lucene or DataPrime syntax. Results are displayed in Grafana's log panel.

- **Plugin ID**: `sdague-ibmlogs-datasource`
- **Type**: Frontend-only Grafana datasource plugin (no backend binary)
- **Language**: TypeScript + React
- **Grafana SDK version**: 13.2.x
- **Minimum Grafana**: 11.0.0

## Architecture

```
src/
├── module.ts          # Plugin entry point - registers datasource with Grafana
├── datasource.ts      # Core API logic: query execution, SSE streaming, connection test
├── types.ts           # TypeScript interfaces (MyQuery, MyDataSourceOptions, MySecureJsonData)
└── components/
    ├── ConfigEditor.tsx   # Settings UI: endpoint URL + API key
    └── QueryEditor.tsx    # Query UI: query text, syntax, tier + result limit
```

### Key Design Decisions

- **No backend component**: Authentication is handled via Grafana's built-in `tokenAuth` route proxy (defined in `src/plugin.json`). The proxy exchanges the IBM API key for an OAuth2 token via `https://iam.cloud.ibm.com/identity/token` and forwards requests to the configured endpoint.
- **Server-Sent Events**: The IBM Logs query API returns results as an SSE stream. `datasource.ts` uses `eventsource-parser` to consume chunks from a `fetch()` ReadableStream.
- **Log frame structure**: Results are shaped into Grafana DataFrames with fields: `timestamp`, `message`, `labels`, `severity`, `body`.

### Data Flow

1. User enters a Lucene or DataPrime query in `QueryEditor`
2. `datasource.query()` substitutes template variables and calls `doStream('/v1/query', ...)`
3. `doStream()` POSTs to Grafana's proxy route (`/logs/v1/query`), which handles token auth
4. SSE events are parsed; each `result.results[]` item becomes a log line
5. Log lines are parsed for `timestamp`, `level`, and `message` fields from JSON user_data
6. A `MutableDataFrame` is returned to Grafana for rendering

## Development

### Prerequisites

- Node.js >= 24.5 (see `.nvmrc`)
- npm 11 (bundled with Node 24)
- Docker (for local Grafana instance)

### Setup

```bash
npm ci
npm run dev          # webpack watch mode with live reload
npm run server       # starts Grafana at localhost:3000 via docker-compose
```

The docker-compose mounts `dist/` into the Grafana container and enables anonymous auth with admin privileges.

### Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Watch mode build with live reload |
| `npm run build` | Production webpack build |
| `npm run typecheck` | TypeScript type checking (`tsc --noEmit`) |
| `npm run lint` | ESLint |
| `npm run lint:fix` | ESLint with auto-fix |
| `npm run test` | Jest watch mode (changed files only) |
| `npm run test:ci` | Jest full run (4 workers, passWithNoTests) |
| `npm run e2e` | Playwright E2E tests (`@grafana/plugin-e2e`) |
| `npm run server` | Docker-compose Grafana |

### Before Committing

Run in this order:

```bash
npm run typecheck
npm run lint
npm run test:ci
npm run build
```

CI runs these same checks on push/PR to main.

### DCO sign-off

Every commit must carry a Developer Certificate of Origin sign-off (a
`Signed-off-by:` trailer); the DCO check on pull requests enforces this.
Always commit with `-s`:

```bash
git commit -s -m "..."
```

To fix commits that are missing it, use `git commit --amend -s --no-edit`
for the last commit, or `git rebase --signoff main` for a whole branch.

## Release Process

Releases are automated via GitHub Actions (`.github/workflows/release.yml`). To release:

1. Bump `version` in `package.json`
2. Update `CHANGELOG.md` with a new `## X.Y.Z` section
3. Commit and push to main

The workflow automatically detects the version bump (no GitHub release yet for `vX.Y.Z`), creates the `vX.Y.Z` git tag, then builds, signs, validates, and publishes a GitHub release with the signed zip and MD5 checksum.

If a release run fails partway (the tag is pushed before signing and publishing), what to do depends on where the cause is:

- **Workflow or tooling problem** (e.g. a signing tool change): fix `release.yml` on main and re-run the **Release** workflow via `workflow_dispatch` (merging the fix to main also triggers it). It reuses the existing tag and builds from that tagged commit. Don't delete the tag.
- **Problem in the plugin itself** (e.g. the validator rejects something in `src/` or `plugin.json`): retrying would rebuild the same broken tagged code. Fix it and bump the version instead.

The workflow only releases when GitHub definitively reports no release for the version, so a draft release for `vX.Y.Z` will also block it.

`@grafana/sign-plugin` (run via `npx ...@latest`) requires Node >= 24.5. CI and the compatibility check read the Node version from `.nvmrc`. The release job sets it explicitly, because it builds from the release tag and that tag's `.nvmrc` may be older, so bump both together.

**Required secrets**: `GRAFANA_ACCESS_POLICY_TOKEN`, `ROOT_URL`

### Local/Manual Build

For building a signed zip locally (e.g., deploying outside the Grafana plugin catalog):

```bash
# Set in env.sh or export directly:
export GRAFANA_ACCESS_POLICY_TOKEN=...
export ROOT_URL=https://your-grafana-instance.example.com
./build.sh
```

This produces `sdague-ibmlogs-datasource-<version>.zip`.

## CI/CD

- **CI** (`.github/workflows/ci.yml`): Runs on push/PR to main. Checks types, lints, tests, builds, then runs Playwright E2E against a docker-composed Grafana instance.
- **Release** (`.github/workflows/release.yml`): Runs on push to main and `workflow_dispatch`. When `package.json` has a version with no GitHub release yet, tags it, then builds, signs, validates, and publishes the release.
- **Compatibility** (`.github/workflows/is-compatible.yml`): Checks Grafana API compatibility on PRs using `@grafana/levitate`.

## Configuration Files

Build tooling lives in `.config/` (scaffolded by `@grafana/create-plugin`). Root config files (`tsconfig.json`, `jest.config.js`, `.eslintrc`) extend from `.config/`. Don't edit `.config/` directly unless you understand the scaffolding system.

### `react-router` override

`package.json` pins `react-router` to `7.18.3` inside `react-router-dom-v5-compat` via
`overrides`. `@grafana/ui` depends on `react-router-dom-v5-compat`, which itself depends on a
vulnerable `react-router@6.x` (GHSA-wrjc-x8rr-h8h6, GHSA-337j-9hxr-rhxg) and will never move to
`react-router@7.x` since it exists solely as a v5→v6 compatibility shim. Do not remove this
override — doing so silently reintroduces those CVEs into `npm audit`. `react-router` is also
externalized in the webpack build, so it never ships in `dist/module.js` regardless.

### `js-yaml` override

`package.json` forces `@istanbuljs/load-nyc-config` (pulled in by jest's coverage tooling) onto
`js-yaml@^4` instead of `js-yaml@3`. `js-yaml@3` depends on `argparse@1`, which depends on
`sprintf-js` (GHSA-hp3w-g68c-fv3c), and `sprintf-js` has no patched release. load-nyc-config only
calls `yaml.load()`, which is API-compatible in v4. Do not remove this override while
`sprintf-js` remains unpatched.

### `minimatch` override

`package.json` rewrites any `minimatch@^10` request to `^11.0.4` (`"minimatch@^10": "^11.0.4"`).
`eslint@10`, `@eslint/config-array`, and `@typescript-eslint/typescript-estree` come in via
`@grafana/i18n` (a dependency of `@grafana/data`) and still declare `minimatch@^10`, which is
vulnerable to GHSA-g3hv-75wg-m249 (CVE-2026-118764, fixed in 11.0.1). They only use
`minimatch()`/`Minimatch`, whose API is unchanged in v11. Keying on `^10` leaves the
`minimatch@3` consumers (eslint 8, jest, glob 7; unaffected) alone. Remove this override once
those packages accept `minimatch@^11`. The direct `glob@^14` devDependency already pulls in `minimatch@11`.

## Testing

Tests go in `src/**/*.test.ts` or `src/**/__tests__/`. The test environment is jsdom. CSS imports are mocked with `identity-obj-proxy`.

## IBM Cloud Logs API

- **Query endpoint**: `POST /v1/query` (SSE response)
- **Health check**: `GET /v1/data_usage`
- **Auth**: IAM OAuth2 token via API key exchange
- **Query syntax**: Lucene (default) or DataPrime, selectable per query
- **Search tier**: `frequent_search`
