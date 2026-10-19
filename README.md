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
to `https://89-116-21-168.sslip.io/zia`:

| Path | Proxied to |
| --- | --- |
| `/api` | `https://89-116-21-168.sslip.io/zia/api` |
| `/ws` | `wss://89-116-21-168.sslip.io/zia/ws` |

The proxy preserves the existing client paths while adding the `/zia` backend
prefix.

## GitHub Pages

The app is built for `https://rabziaur77.github.io/chatbot_frontend/` using the
`/chatbot_frontend/` base path for assets, client-side routes, and in-app
redirects. The Pages workflow sends API requests directly to
`https://89-116-21-168.sslip.io/zia`; set the repository Actions variable
`VITE_API_BASE_URL` to override that backend base URL. The backend must allow
credentialed CORS requests from `https://rabziaur77.github.io`. The workflow
publishes `index.html` as `404.html` too, so refreshing or opening client-side
routes such as `/projects` loads the SPA.

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

The Pages build publishes `public/widget.js` at
`https://rabziaur77.github.io/chatbot_frontend/widget.js`. The install snippet
uses `VITE_WIDGET_SCRIPT_URL` for that script URL and passes `VITE_API_BASE_URL`
as `data-api-url`, because the widget and API can be hosted at different URLs.
Set either value as a GitHub Actions variable to override the production
defaults. The widget reads its public configuration at runtime from
`/api/v1/public/widget-config/{project_key}` relative to the API base URL.