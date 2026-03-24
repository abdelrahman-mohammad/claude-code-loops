# Project Overview
Next.js application with App Router, TypeScript, and Tailwind CSS.

## Project Structure
- `src/app/` — App Router: pages, layouts, loading/error states, route handlers
- `src/components/` — Shared React components (ui/ for primitives, features/ for domain)
- `src/lib/` — Utility functions, database client, shared logic
- `src/hooks/` — Custom React hooks
- `src/types/` — TypeScript type definitions

## Commands
- Dev: `npm run dev`
- Build: `npm run build`
- Test: `npx vitest` (or `npx jest`)
- E2E: `npx playwright test`
- Lint: `npx eslint .`
- Format: `npx prettier --write .`

## Key Rules
- All components are Server Components by default. Only add `'use client'` when the component needs hooks, event handlers, or browser APIs.
- NEVER use `<img>` — always use `next/image` with width, height, and alt text
- NEVER use `<a>` for internal links — always use `next/link`
- Fetch data directly in Server Components with async/await — not useEffect+fetch
- Use Server Actions for mutations — not API routes
- After mutations, call `revalidatePath()` or `revalidateTag()`
- Environment variables: prefix with `NEXT_PUBLIC_` for client-side exposure only
- Next.js 15+: `params`, `cookies()`, `headers()` are async — must `await` them
- Use `next/font` for font optimization
- Use `next/dynamic` for lazy-loading heavy client components

## File Conventions
- `page.tsx` — route UI, `layout.tsx` — shared wrapper, `loading.tsx` — Suspense fallback
- `error.tsx` — error boundary (must be `'use client'`), `not-found.tsx` — 404 UI
- `route.ts` — API Route Handler, `(group)/` — route groups, `[slug]/` — dynamic segments
