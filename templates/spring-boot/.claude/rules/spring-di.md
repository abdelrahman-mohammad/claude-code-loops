---
description: Rules for Spring dependency injection and bean management
globs: "*.java"
---

# Spring Dependency Injection Rules

- Use constructor injection exclusively. Never use `@Autowired` on fields. Use Lombok's `@RequiredArgsConstructor` to generate the constructor.
- Place `@Transactional` on service methods that modify data. Never place `@Transactional` on controller methods.
- Never use `@Data` on JPA entities. It generates `equals`/`hashCode` based on all fields, which breaks with lazy-loaded relationships. Use `@Getter`, `@NoArgsConstructor`, and `@AllArgsConstructor` instead.
- Use `@ConfigurationProperties` for grouped configuration values (e.g., a set of related properties under a common prefix). Use `@Value` only for single, standalone configuration values.
- Use `@Valid` on all controller `@RequestBody` parameters to trigger Jakarta Bean Validation.
- Prototype-scoped beans injected into singleton-scoped beans must use `ObjectProvider<T>`. Inject `ObjectProvider<T>` and call `.getObject()` each time a new instance is needed. Direct injection of a prototype into a singleton results in a single shared instance.
