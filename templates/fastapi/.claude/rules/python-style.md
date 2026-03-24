When working on Python files:
- Use Python 3.10+ syntax: `list[str]`, `dict[str, int]`, `str | None` — never `typing.List`, `typing.Optional`
- All functions must have return type annotations
- Use async def for I/O-bound operations; plain def for CPU-bound or trivial
- NEVER use `time.sleep()`, `requests.*`, `open()`, or sync DB calls inside `async def`
- Use `Annotated[type, Depends(...)]` for FastAPI dependency injection
- Pydantic v2 patterns only: `.model_dump()`, `ConfigDict(from_attributes=True)`, `@field_validator`
- Raise `HTTPException` with status codes from `starlette.status`
