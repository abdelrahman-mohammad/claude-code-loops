# Project Overview

<!-- TODO: Replace this with a description of your project -->
This is a Node.js/TypeScript project. Describe what it does, its main purpose, and any key architectural decisions here.

## Commands

- **Build:** `npm run build`
- **Test (all):** `npm test`
- **Test (single):** `npx jest path/to/test.ts`
- **Lint:** `npm run lint`
- **Lint (fix):** `npm run lint:fix`
- **Dev server:** `npm run dev`

## Code Conventions

- Use strict TypeScript. Never use `any` types.
- All exported functions and methods must have explicit return types.
- Use async/await for asynchronous code. Never use raw Promise chains.
- Use the `@/` path alias for all src-relative imports.

## File Structure

```
src/
  routes/       # HTTP route handlers
  services/     # Business logic
  repositories/ # Data access layer
  middleware/   # Express/Koa middleware
  types/        # Shared TypeScript types and interfaces
```

## Testing

- Framework: Jest with ts-jest
- Test location: co-located in `__tests__/` directories
- Use `jest.mock()` for external dependencies
- Every new feature or bugfix should include tests

## API Conventions

- REST endpoints use plural nouns (e.g., `/users`, `/orders`)
- All responses use the envelope format: `{ data, error, meta }`
- Request validation uses Zod schemas

## Git

- Use conventional commits: `feat:`, `fix:`, `refactor:`, `test:`
