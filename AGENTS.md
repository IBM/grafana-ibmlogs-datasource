# AGENTS.md - grafana-ibmlogs-datasource

## Project Overview

A Grafana datasource plugin that connects Grafana to the IBM Cloud Logs service. Users configure an IBM Cloud Logs endpoint and API key, then query logs using Lucene syntax. Results are displayed in Grafana's log panel.

- **Plugin ID**: `sdague-ibmlogs-datasource`
- **Type**: Frontend-only Grafana datasource plugin (no backend binary)
- **Language**: TypeScript + React
- **Grafana SDK version**: 10.4.x
- **Minimum Grafana**: 9.5.3

## Architecture

```
src/
├── module.ts          # Plugin entry point - registers datasource with Grafana
├── datasource.ts      # Core API logic: query execution, SSE streaming, connection test
├── types.ts           # TypeScript interfaces (MyQuery, MyDataSourceOptions, MySecureJsonData)
└── components/
    ├── ConfigEditor.tsx   # Settings UI: endpoint URL + API key
    └── QueryEditor.tsx    # Query UI: Lucene query text + result limit
```

### Key Design Decisions

- **No backend component**: Authentication is handled via Grafana's built-in `tokenAuth` route proxy (defined in `src/plugin.json`). The proxy exchanges the IBM API key for an OAuth2 token via `https://iam.cloud.ibm.com/identity/token` and forwards requests to the configured endpoint.
- **Server-Sent Events**: The IBM Logs query API returns results as an SSE stream. `datasource.ts` uses `eventsource-parser` to consume chunks from a `fetch()` ReadableStream.
- **Log frame structure**: Results are shaped into Grafana DataFrames with fields: `timestamp`, `message`, `labels`, `severity`, `body`.

### Data Flow

1. User enters a Lucene query in `QueryEditor`
2. `datasource.query()` substitutes template variables and calls `doStream('/v1/query', ...)`
3. `doStream()` POSTs to Grafana's proxy route (`/logs/v1/query`), which handles token auth
4. SSE events are parsed; each `result.results[]` item becomes a log line
5. Log lines are parsed for `timestamp`, `level`, and `message` fields from JSON user_data
6. A `MutableDataFrame` is returned to Grafana for rendering

## Development

### Prerequisites

- Node.js >= 16 (see `.nvmrc`)
- npm 9.2.0
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
| `npm run e2e` | Cypress E2E tests |
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

## Release Process

Releases are automated via GitHub Actions (`.github/workflows/release.yml`). To release:

1. Bump `version` in `package.json`
2. Update `CHANGELOG.md` with a new `## X.Y.Z` section
3. Commit and push to main

The workflow automatically detects the version bump, creates the `vX.Y.Z` git tag, then builds, signs, validates, and publishes a GitHub release with the signed zip and MD5 checksum.

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

- **CI** (`.github/workflows/ci.yml`): Runs on push/PR to main. Checks types, lints, tests, builds. Runs Cypress E2E if `cypress/` exists.
- **Release** (`.github/workflows/release.yml`): Triggered by `v*` tags. Builds, signs, validates, publishes GitHub release.
- **Compatibility** (`.github/workflows/is-compatible.yml`): Checks Grafana API compatibility on PRs using `@grafana/levitate`.

## Configuration Files

Build tooling lives in `.config/` (scaffolded by `@grafana/create-plugin`). Root config files (`tsconfig.json`, `jest.config.js`, `.eslintrc`) extend from `.config/`. Don't edit `.config/` directly unless you understand the scaffolding system.

## Testing

Tests go in `src/**/*.test.ts` or `src/**/__tests__/`. The test environment is jsdom. CSS imports are mocked with `identity-obj-proxy`.

## IBM Cloud Logs API

- **Query endpoint**: `POST /v1/query` (SSE response)
- **Health check**: `GET /v1/data_usage`
- **Auth**: IAM OAuth2 token via API key exchange
- **Query syntax**: Lucene
- **Search tier**: `frequent_search`
