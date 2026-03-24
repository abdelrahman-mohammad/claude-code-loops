# Spring Boot Project Conventions

## Project Overview

This is a Spring Boot 3.x REST API application.

- **Language**: Java 21
- **Build tool**: Maven
- **Database**: PostgreSQL (production), H2 (development/test)
- **Migrations**: Flyway
- **Framework**: Spring Boot 3.x with Spring Data JPA

## Package Structure

```
com.example.myapp/
├── controller/       # REST controllers — @RestController, request/response handling only
├── service/          # Business logic — @Service, @Transactional methods
├── repository/       # Data access — Spring Data JPA repositories
├── model/            # JPA entities — @Entity classes
├── dto/              # Data transfer objects — Java records for requests/responses
├── config/           # Configuration — @Configuration, @ConfigurationProperties
├── exception/        # Exception handling — @RestControllerAdvice, custom exceptions
└── mapper/           # Object mapping — entity ↔ DTO conversion logic
```

## Coding Conventions

- **Constructor injection** exclusively — use `@RequiredArgsConstructor`, never `@Autowired` on fields
- **`@Transactional`** on service methods that modify data — never on controllers
- **Java records** for all DTOs (request, response, projections)
- **Lombok**: use `@Getter`, `@NoArgsConstructor`, `@AllArgsConstructor` on entities — never `@Data` on JPA entities (breaks `equals`/`hashCode` with lazy-loaded fields)
- **`Optional`** only as method return types — never as fields or method parameters
- **Catch specific exceptions** — never catch generic `Exception` unless re-throwing
- **`@ConfigurationProperties`** for grouped configuration values, `@Value` only for single standalone values
- **Jakarta Bean Validation** (`@Valid`, `@NotNull`, `@NotBlank`, `@Size`) on request DTOs and controller `@RequestBody` parameters
- **ProblemDetail** (RFC 7807) for all error responses via `@RestControllerAdvice`
- **SLF4J** with `@Slf4j` for all logging — never use `System.out.println`

## Build Commands

| Command | Purpose |
|---|---|
| `mvn compile -q` | Compile all modules |
| `mvn test -q` | Run all unit tests |
| `mvn verify -q` | Full build with integration tests |
| `mvn test -DskipITs -q` | Run unit tests only, skip integration tests |
| `mvn spotless:apply` | Auto-format code |
| `mvn checkstyle:check -q` | Check code style compliance |
| `mvn test -Dtest=MyClassTest -q` | Run a single test class |
| `mvn test -Dtest="MyClassTest#methodName" -q` | Run a single test method |

## Spring Profiles

| Profile | Database | Purpose |
|---|---|---|
| `default` | H2 (in-memory) | Local development without external dependencies |
| `test` | H2 (in-memory) | Automated test execution |
| `dev` | PostgreSQL | Development with real database |
| `prod` | PostgreSQL + connection pooling (HikariCP) | Production deployment |

Configure profiles in `application.yml` using `---` separators and `spring.config.activate.on-profile`.

## Database Migrations

- **Tool**: Flyway
- **Location**: `src/main/resources/db/migration/`
- **Naming convention**: `V{version}__{description}.sql` (e.g., `V1__create_users_table.sql`, `V2__add_email_index.sql`)
- **Rules**:
  - Never modify an existing migration that has been applied
  - Always create a new migration file for schema changes
  - Use descriptive names that explain the change
- **Test data**: Place test-only seed data in `src/test/resources/db/testdata/`

## Testing Patterns

- **Framework**: JUnit 5 + Mockito
- **Controller tests**: `@WebMvcTest` with `MockMvc` for testing REST endpoints in isolation
- **Integration tests**: `@SpringBootTest` with `@MockitoBean` for replacing specific beans
- **Repository tests**: `@DataJpaTest` for testing JPA repositories with an embedded database
- **Testcontainers**: Use for integration tests requiring a real PostgreSQL instance
- **Naming convention**: `MethodName_StateUnderTest_ExpectedBehavior` (e.g., `findById_WhenUserExists_ReturnsUser`)
- **Structure**: Arrange-Act-Assert (AAA) pattern in every test method

## Anti-Patterns (Do NOT Do These)

- **Field injection** — use constructor injection via `@RequiredArgsConstructor`
- **`@Data` on JPA entities** — use `@Getter`, `@NoArgsConstructor`, `@AllArgsConstructor` instead
- **Catching generic `Exception`** — catch specific exception types
- **Business logic in controllers** — delegate to service layer
- **Mutable DTOs** — use Java records
- **String concatenation in JPQL/SQL** — use parameterized queries (`@Query` with `:param` or Spring Data method naming)
- **`@Transactional` on controllers** — place on service methods only
- **Prototype beans in singletons** without `ObjectProvider` — inject `ObjectProvider<T>` and call `.getObject()` for each use
