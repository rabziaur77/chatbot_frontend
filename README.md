# OmniSupport dashboard

React + Vite dashboard and embedded chat widget for the OmniSupport backend. It
is a pure client: there is no server-side rendering and no environment
configuration.

## Run locally

**Prerequisite:** Node.js

```bash
npm install
npm run dev
```

The dev server listens on `0.0.0.0:3000` and proxies the two backend transports
to `localhost:8000`:

| Path | Proxied to |
| --- | --- |
| `/api` | `http://localhost:8000` |
| `/ws` | `ws://localhost:8000` |

Start the backend on port 8000 first, otherwise every request fails and the
login page appears to hang.

## Build

```bash
npm run build
```

This writes `dist/`. The backend serves it as a static SPA, so a dashboard that
never appears after a backend start almost always means `dist/` is missing or
stale — the backend logs `frontend dist not found; serving API only` and comes up
with no UI rather than failing.

## Checks

```bash
npm run lint
```

Type-checks with `tsc --noEmit`. There is no unit test runner in this project.

## How it talks to the backend

Requests use relative `/api/v1/...` paths with `credentials: 'include'`, so the
browser sends the httpOnly refresh cookie on every call. No API base URL or API
key is configured in the client; the backend resolves the caller from the access
token and refresh cookie.

The embeddable widget script is served by the backend at `/widget.js`, not from
this project, and it reads its own configuration at runtime from
`/api/v1/public/widget-config/{project_key}`.