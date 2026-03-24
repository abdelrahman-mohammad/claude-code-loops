# Project Overview
Django application with Django REST Framework, pytest-django, and factory_boy.

## Project Structure
- `manage.py` — Django management entry point
- `config/` — Project settings, root URLs, WSGI/ASGI
  - `settings/base.py`, `dev.py`, `prod.py` — Split settings with django-environ
- `apps/` — Django applications (users/, products/, orders/, etc.)
  - Each app: models.py, views.py, urls.py, serializers.py, tests/, migrations/
- `templates/` — Django templates
- `static/` — Static assets (CSS, JS, images)

## Commands
- Run: `python manage.py runserver`
- Test: `pytest -x --tb=short`
- Test with coverage: `pytest --cov=apps --cov-report=term-missing`
- Lint: `ruff check .`
- Format: `ruff format .`
- Type check: `mypy apps/`
- New migration: `python manage.py makemigrations`
- Apply migrations: `python manage.py migrate`
- Check missing migrations: `python manage.py makemigrations --check`
- Deployment checks: `python manage.py check --deploy`

## Conventions
- Fat models, thin views: business logic in models/services, views handle HTTP only
- Always use `select_related()` for ForeignKey/OneToOne, `prefetch_related()` for M2M/reverse FK
- Use `get_user_model()` or `settings.AUTH_USER_MODEL` — never import User directly
- Use `reverse()` for URL references — never hardcode URLs
- Use `DecimalField` for currency — never `FloatField`
- Use factory_boy for test data, not JSON fixtures
- DRF: separate read/write serializers, override `get_queryset()` with proper prefetching
- Ruff with `DJ` rules enabled for Django-specific linting
