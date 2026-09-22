# ai-memory-ui

Custom SolidJS console for [`ai-memory`](https://github.com/akitaonrails/ai-memory).
The server hosts the built SPA at `/web` (`--web-ui-dir`). The browser reads
`/api/v1` and operates `/admin` with the human session cookie. It never reads
SQLite or wiki files directly.

> Requires an `ai-memory` server with `/api/v1`, `/admin`, and `--web-ui-dir`.

## Screenshots

| Home (namespaces) | Workspace overview |
| --- | --- |
| ![Home](docs/screenshots/home.png) | ![Workspace overview](docs/screenshots/workspace-overview.png) |

| Project overview | Document reader | Search palette |
| --- | --- | --- |
| ![Project overview](docs/screenshots/project-overview.png) | ![Document](docs/screenshots/document.png) | ![Search](docs/screenshots/search.png) |

## Purpose & Authentication

This app is a same-origin SPA for `ai-memory`:

- `/web` serves the built `dist/` directory (`--web-ui-dir`).
- Human authentication uses username and password via `POST /auth/login`, issuing an `HttpOnly` session cookie (`ai_memory_session`) and a readable CSRF cookie (`ai_memory_csrf`).
- All state-changing mutations (`POST`, `PUT`, `PATCH`, `DELETE`) require the `X-CSRF-Token` header.
- No secret tokens or Bearer credentials are stored in `localStorage` or transmitted by the browser for human access.
- Native programmatic credentials (`aim_`) are managed in **Access** (`/access`) and authenticate agents and CLI directly on the engine.
- External consumer keys (`amk_`) are managed in **Consumers** (`/consumers`) under `mcp-auth` authority.
- Break-glass recovery is supported via `POST /auth/recovery` using the server's configured recovery token.
- `/api/v1` and `/admin` JSON APIs serve the frontend with `credentials: "include"`.
- The UI never reads SQLite or wiki files directly.

Navigation has two levels:

- **Server:** overview, workspaces, sessions, activity, audit, graph, access (`aim_`), users, consumers (`amk_`), operations, backups, configuration.
- **Project:** wiki, page reader (write and delete for admins), sessions, handoffs, messages, pending writes, project operations.

Consumers lists keys from the mcp-auth sidecar at `/keys`. When that route is not on the same host, the table stays empty and the screen says so — it does not invent rows.

The UI supports the workspace layout where each company/client can be a
workspace, while shared knowledge lives in separate workspaces such as
`practice/unit-testing` or `company/strategy`.

Search modes:

- `Project`: sends `GET /api/v1/search?q=...&workspace=...&project=...`.
- `Selected`: sends `POST /api/v1/search` with explicit scopes.
- `Global`: sends `GET /api/v1/search?q=...` and searches all latest pages.

Example selected-scope request:

```json
{
  "q": "unit test strategy",
  "limit": 12,
  "scopes": [
    { "workspace": "client-a", "project": "product" },
    { "workspace": "practice", "project": "unit-testing" }
  ]
}
```

This makes cross-project recall intentional. The frontend can combine a
client project with shared practice knowledge without broad global
search and without copying pages between workspaces.

## Stack

- SolidJS 2 (`solid-js` + `@solidjs/web`, `@solidjs/vite-plugin`) + TanStack Router 2 (file-based) + TanStack Query 6
- Tailwind CSS v4 (`@tailwindcss/vite`); UI primitives are native elements in `src/components/` (popover on `@floating-ui/dom`, Lucide icons vendored in `icons.tsx`)
- i18n via inlang Paraglide JS (`en` / `pt-BR` / `es`)

## Develop

```bash
npm install
npm run dev      # http://localhost:5173/web/
npm run build    # generates dist/ (runs i18n + route gen + tsc + vite)
```

Offline preview without a backend: `VITE_FIXTURES=1 npm run dev`.

### Branding

The header name/tagline are build-time env vars (default `ai-memory` /
`knowledge browser`):

```bash
VITE_APP_NAME="Knowledge Base" VITE_APP_TAGLINE="run2biz" npm run build
```

## Serve through ai-memory

```bash
ai-memory serve --transport http --bind 127.0.0.1:49374 \
  --enable-web --web-ui-dir /path/to/ai-memory-ui/dist
```

Then open `http://localhost:49374/web`.

The server is **multi-workspace**: `/web` and `/api/v1` browse every workspace in
the data dir. `--workspace`/`--project` are optional (default `default`) and only
name the workspace/project auto-created and used as the default for session
capture and MCP — they don't scope what the UI can see.

## Tests

```bash
npm run test:e2e   # Playwright (system Chrome), fixtures mode
```

Regenerate the screenshots above against a running server with data:

```bash
BASE=http://127.0.0.1:49374/web node scripts/screenshots.mjs
```
