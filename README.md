## データのインポート

デフォルト（v1.0-trainval）

```bash
docker compose exec api python scripts/import_nuscenes.py
```

バージョン指定

```bash
docker compose exec api python scripts/import_nuscenes.py --dataset-version v1.0-mini
```
