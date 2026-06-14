## API Reference
<!-- エンドポイント表 -->

## Test

All tests

```bash
docker compose exec api pytest /app/tests/ -v
```

test by each file

```bash
docker compose exec api pytest /app/tests/unit/test_annotation_merger.py -v
```
