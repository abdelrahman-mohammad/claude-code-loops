# Project Overview
FastAPI application with async SQLAlchemy, Pydantic v2, and Alembic migrations.

## Project Structure
- `app/main.py` — FastAPI app initialization, lifespan, router inclusion
- `app/routers/` — API route modules (one per domain)
- `app/models/` — SQLAlchemy ORM models
- `app/schemas/` — Pydantic v2 request/response schemas
- `app/services/` — Business logic layer
- `app/dependencies.py` — Shared FastAPI dependencies (get_db, get_current_user)
- `app/config.py` — Settings via pydantic-settings
- `app/database.py` — Async engine, session factory, Base
- `alembic/` — Database migrations
- `tests/` — pytest test suite

## Commands
- Run: `uvicorn app.main:app --reload`
- Test: `pytest -xvs`
- Test with coverage: `pytest --cov=app --cov-report=term-missing`
- Lint: `ruff check .`
- Format: `ruff format .`
- Type check: `mypy app/`
- New migration: `alembic revision --autogenerate -m "description"`
- Apply migrations: `alembic upgrade head`

## Conventions
- Python 3.12+. Use built-in generics: `list[str]`, `str | None` — never `typing.List` or `Optional`
- All functions must have return type annotations
- Use `Annotated[type, Depends(...)]` for dependency injection
- Pydantic v2 only: `ConfigDict(from_attributes=True)`, `@field_validator`, `.model_dump()`
- Async endpoints for I/O. NEVER call blocking code (requests, time.sleep, open) in async def
- Use `@asynccontextmanager` lifespan — not deprecated `@app.on_event()`
- Separate request schemas (UserCreate) from response schemas (UserResponse)
- Always specify `response_model` on endpoints
- SQLAlchemy async: use `postgresql+asyncpg://` driver, `async_sessionmaker`
