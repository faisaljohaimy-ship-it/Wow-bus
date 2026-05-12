# Wow-bus

Saudi Energy Transportation web app, built on TanStack Start (React + TanStack Router + TanStack Query + Tailwind).

## Getting started

```bash
npm install
npm run dev
```

The dev server runs on http://localhost:3000 by default. Vite will generate `src/routeTree.gen.ts` automatically on first run.

## Scripts

- `npm run dev` — start the dev server (SSR + HMR)
- `npm run build` — build for production into `.output/`
- `npm start` — run the built production server
- `npm run typecheck` — TypeScript check, no emit

## Layout

- `src/routes/__root.tsx` — root layout (head metadata, error/404 boundaries, HTML shell)
- `src/routes/index.tsx` — home page
- `src/router.tsx` — router factory wiring TanStack Query into route context
- `src/client.tsx` / `src/ssr.tsx` — TanStack Start entry points
- `src/styles.css` — Tailwind + design tokens (shadcn-style HSL variables)
