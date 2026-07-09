# Heidy

React frontend for the Heidy API.

## Run

```bash
npm install
npm run dev
```

The dev server proxies `/api` to `https://heidy-backend.fly.dev` by default.

Use another API target with:

```bash
VITE_API_PROXY_TARGET=http://localhost:4000 npm run dev
```
