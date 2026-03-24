When working on Next.js files:
- Components are Server Components by default. Only add 'use client' when hooks, event handlers, or browser APIs are needed.
- Push 'use client' to the smallest leaf component possible
- Fetch data directly in Server Components with async/await — never useEffect+fetch
- Use Server Actions ('use server') for mutations — not API Route Handlers
- Always use `next/image` instead of `<img>` — requires alt, width, height props
- Always use `next/link` instead of `<a>` for internal navigation
- Export `metadata` or `generateMetadata()` on every page.tsx
- Next.js 15+: `params`, `cookies()`, `headers()` return Promises — must `await` them
- Wrap async Server Components in `<Suspense>` with a fallback
