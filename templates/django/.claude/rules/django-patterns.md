When working on Django files:
- Always use `select_related()` for ForeignKey/OneToOne access, `prefetch_related()` for M2M/reverse FK
- Use `get_user_model()` or `settings.AUTH_USER_MODEL` — never `from django.contrib.auth.models import User`
- Use `reverse()` for URL references — never hardcode URL paths
- Use `DecimalField` for currency — never `FloatField`
- Use `.count()` not `len(queryset)`, `.exists()` not `bool(queryset)`
- Use `F()` expressions for atomic field updates, `Q()` for complex lookups
- Put business logic in model methods or services — never in views
- Add `db_index=True` to fields used in filter() or order_by()
- Always provide `related_name` on ForeignKey fields
