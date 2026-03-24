---
description: Style rules for Java source files
globs: "*.java"
---

# Java Style Rules

- Use Java records for DTOs and immutable data carriers. Never use mutable classes for data transfer.
- Use `Optional` only as method return types. Never use `Optional` as a field type or method parameter.
- Catch specific exceptions. Never catch generic `Exception` unless you are re-throwing it wrapped in a more specific type.
- Prefer Stream API over imperative loops where it improves readability. Fall back to loops for complex multi-step mutations.
- Use SLF4J with `@Slf4j` (Lombok) for all logging. Never use `System.out.println` or `System.err.println`.
- Keep methods under 30 lines. Extract helper methods for complex logic.
- Keep classes under 300 lines. Split large classes by responsibility.
