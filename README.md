## DBのマイグレーション

```bash
docker compose up -d db
docker compose run --rm migrations   # initial + add_indexes の2マイグレーションが適用される          
```

## データのインポート

### 本体

nuScenesデータセットのメタデータのjsonファイルが入っているフォルダ名（`v1.0-mini`や`v1.0-trainval`）を指定してDBにデータを読み込めます

#### デフォルト（v1.0-trainval）

```bash
docker compose exec api python scripts/import_nuscenes.py
```

#### バージョン指定

```bash
docker compose exec api python scripts/import_nuscenes.py --dataset-version v1.0-mini
```

### Map Expansion

```bash
docker compose exec api python scripts/import_nuscenes_map.py
```
