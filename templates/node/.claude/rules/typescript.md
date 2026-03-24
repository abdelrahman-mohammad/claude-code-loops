# TypeScript Rules

- Use strict TypeScript with no `any` types. If a type is truly unknown, use `unknown` and narrow it.
- All exports must have explicit return types. Do not rely on type inference for public APIs.
- Use async/await for asynchronous code. Never use raw Promise chains (`.then()`, `.catch()`).
- Use the `@/` path alias for all src-relative imports instead of relative paths like `../../`.
- Prefer `interface` over `type` for object shapes. Use `type` for unions, intersections, and mapped types.
- Use discriminated unions for state variants. Include a literal `kind` or `type` field as the discriminant.
- Handle all cases in switch statements exhaustively. Use a `default: never` check to catch unhandled cases at compile time.
