# nuscenes-viewer
nuScenesデータセットを可視化＆データやアノテーションを追加・修正するためのWebアプリ

## Project Overview
NuScenes dataset + Map expansion visualizer / annotation tool
- Backend: FastAPI (Python 3.12)
- Frontend: React + TypeScript + Deck.gl
- Data: ローカルフォルダのnuscenesデータセットのうち、メタデータを初期化時にDatabaseに読み込み、画像、点群データはローカルフォルダから直接読込
- DB schema: backend/app/modelsフォルダにあるSQL Alchemy形式スキーマを使用する
- 全サービスをDockerコンテナで構成

## Directory Structure
```
project-root/
├── CLAUDE.md
├── docker-compose.yml
├── .env
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml
│   └── app/
│       ├── main.py                         # FastAPIアプリ初期化・ルーター登録
│       ├── dependencies.py                 # DBセッションなど共通依存関係
│       ├── json_conversion/                # 元のJSON形式データセットとDBとを相互変換するためのモジュール集
│       │   ├── schemas_nuscenes.py         # NuScenes本体データセットJSONのPydantic形式スキーマ
│       │   ├── to_nuscenes.py              # NuScenes本体データセットをDBからJSONに変換
│       │   ├── to_nusc_db.py               # NuScenes本体データセットをJSONからDBに変換
│       │   ├── schemas_mapexpansion.py     # Map expansionデータセットJSONのPydantic形式スキーマ
│       │   ├── to_map_db.py               # NMap expansionデータセットをJSONからDBに変換
│       │   └── to_mapexpansion.py          # Map expansionデータセットをDBからJSONに変換
│       ├── core/
│       │   ├── config.py                   # 環境変数・設定（Pydantic Settings）
│       │   └── logging.py                  # ロギング設定
│       ├── db/
│       │   ├── base.py                     # DeclarativeBase
│       │   ├── session.py                  # AsyncSession ファクトリ
│       │   └── poitgis.py                  # PostGIS初期化・拡張確認（ファイル名は typo だが変更禁止）
│       ├── models/                         # ★手動作成・変更禁止ゾーン。SQLAlchemy ORMモデル（唯一の正）
│       │   ├── __init__.py                 # Alembicがモデルを検出できるよう全importを記載
│       │   ├── scene.py                    # Scene, Sample
│       │   ├── annotation.py               # SampleAnnotation, Instance, Category
│       │   ├── sensor.py                   # Sensor, CalibratedSensor, EgoPose
│       │   └── map.py                      # Map expansion（PostGISジオメトリ含む）
│       ├── schemas/                        # Pydantic スキーマ（APIスキーマ）
│       │   ├── scene.py                    # SceneResponse, SampleResponse
│       │   ├── annotation.py               # BoundingBox3DResponse, AnnotationResponse
│       │   ├── sensor.py                   # CalibratedSensorResponse, EgoPoseResponse
│       │   ├── map.py                      # Map expansion (MapResponse, GeoJSONFeature)
│       │   └── common.py                   # Point3D, Quaternion, Dimensions3D など共通型
│       ├── converters/                     # DB → APIスキーマへの変換ロジック
│       │   ├── annotation.py               # SampleAnnotation → BoundingBox3D
│       │   ├── scene.py                    # Scene → SceneResponse
│       │   ├── sensor.py                   # EgoPose → 変換行列など
│       │   └── geometry.py                 # GeoAlchemy2 → GeoJSON変換など
│       ├── service/                        # ビジネスロジック層（Repository + Converter の組合せ）
│       │   ├── annotation.py               # アノテーション取得・更新サービス
│       │   ├── geometry.py                 # ジオメトリ計算サービス（面積・長さ等）
│       │   ├── scene.py                    # シーン・サンプル関連サービス
│       │   └── sensor.py                   # センサーデータ配信サービス
│       ├── repositories/                   # DBアクセスの抽象化（クエリの責務）
│       │   ├── scene.py                    # SceneRepository
│       │   ├── annotation.py               # AnnotationRepository
│       │   ├── sensor.py                   # SensorRepository
│       │   └── map.py                      # MapRepository（空間クエリ含む） Map expansion用
│       └── api/
│           └── v1/
│               ├── router.py               # v1ルーターの集約
│               └── endpoints/
│                   ├── scenes.py           # GET /scenes, GET /scenes/{token}, GET /scenes/{token}/samples, GET /scenes/{token}/ego-poses
│                   ├── samples.py          # GET /samples/{token}, GET /samples/{token}/annotations, GET /samples/{token}/sensor-data, GET /samples/{token}/instances
│                   ├── annotations.py      # GET /annotations, GET /annotations/{token}, PATCH /annotations/{token}
│                   ├── sensors.py          # GET /sensors, GET /calibrated-sensors, GET /ego-poses, GET /sensor-data/{token}/image, GET /sensor-data/{token}/pointcloud
│                   ├── maps.py             # GET /maps, GET /maps/{token}, GET /maps/{token}/geojson, GET /maps/{location}/basemap
│                   ├── categories.py       # GET /categories
│                   ├── instances.py        # GET /instances, GET /instances/{token}, GET /instances/{token}/annotations, GET /instances/{token}/best-camera
│                   └── logs.py             # GET /logs
├── frontend/
│   ├── Dockerfile
│   ├── vitest.config.ts
│   └── src/
│       ├── pages/               # ScenePage, SamplePage, InstancePage, AnnotationPage, MapPage, SampleMapPage
│       ├── components/          # layout/, common/, scene/, sample/, instance/, annotation/, map/, sample-map/, ui/
│       ├── api/                 # TanStack Query hooks (scenes, samples, annotations, instances, sensors, maps, categories, logs)
│       ├── store/               # viewerStore, navigationStore, mapLayerStore, layerStore
│       ├── types/               # annotation, scene, sensor, map, navigation, common
│       ├── layers/              # MapAnnotationLayers.ts（Deck.gl レイヤー定義）
│       └── lib/                 # coordinateUtils.ts, canvasUtils.ts, utils.ts
└── db/
    └── initdb.d/
        ├── 01_init.sh
        └── 02-init.sql
```

## Schema Rules（最重要）
- `backend/app/models/` が唯一のスキーマ定義とする
- Pydanticスキーマ・CRUDは必ずmodelsから派生させる
- **カラム追加・変更は必ずmodels/を先に修正してから伝播させる**
- モデル変更時はAlembicマイグレーションも同時に生成すること
- 実際のデータ構造は`./data/nuscenes`フォルダのシンボリックリンク先のデータセットも参照する

## Frontend
- 描画:      Deck.gl 9.x
- UI:        React 19 + TypeScript 5.x + Vite 6.x
- スタイル:  Tailwind CSS 4.x + shadcn/ui
- 状態管理:  Zustand 5.x
- API通信:   TanStack Query（@tanstack/react-query）5.x
- フォーム:  React Hook Form 7.x + Zod 3.x（アノテーション編集部分）
- テスト:    Vitest 3.x

### 型定義
- `src/types/` がフロントエンドの唯一の型定義
- バックエンドの `schemas/` と1対1で対応させる
- Claude Codeは型を勝手に作らず必ず `src/types/` を参照する

### 状態管理
- サーバーデータ（APIレスポンス）→ TanStack Query で管理
- UIの選択状態・表示設定 → Zustand で管理
- ローカルのフォームstate → React Hook Form で管理
- この3つを混在させない

### Deck.glレイヤー
- レイヤー定義は `src/layers/` に集約する
- コンポーネント内にレイヤー定義を直接書かない

### APIアクセス
- fetch は必ず `src/api/client.ts` の `apiFetch` を経由する
- コンポーネントから直接 fetch を呼ばない

## Database
- Engine: PostgreSQL 16 + PostGIS 3.4
- ORM: SQLAlchemy 2.x + GeoAlchemy2
- Migration: Alembic

### ジオメトリ型のルール
- DBカラム型: GeoAlchemy2の `Geometry` 型を使用
  - Point    → `Geometry('POINT', srid=4326)`
  - LineString → `Geometry('LINESTRING', srid=4326)`
  - Polygon  → `Geometry('POLYGON', srid=4326)`
- SRID: 常に4326（WGS84）を使用
- API入出力: 常にGeoJSON形式（`{"type": "Point", "coordinates": [...]}` 等）
- GeoJSON ↔ PostGIS変換: **geoalchemy2.shape と shapely を使用**
  - 変換ロジックは `app/converters/geometry.py` に集約する
  - RouterやCRUDに変換コードを直接書かない

### geo_service.pyの変換パターン（参考実装）
```python
# GeoJSON dict → WKBElement（DB保存時）
from geoalchemy2.shape import from_shape
from shapely.geometry import shape

def geojson_to_wkb(geojson: dict):
    return from_shape(shape(geojson), srid=4326)

# WKBElement → GeoJSON dict（APIレスポンス時）
from geoalchemy2.shape import to_shape

def wkb_to_geojson(wkb) -> dict:
    return to_shape(wkb).__geo_interface__
```

## API Design
### 共通ルール
- prefix: `/api/v1`
- レスポンスは常にPydantic schemaを通す
- ジオメトリフィールドはGeoJSON形式で返す
- エラーは `{"detail": "..."}`形式で返す

### エンドポイント構成
実装済みリソース: **scenes / samples / annotations / sensors / maps / categories / instances / logs**

主要エンドポイント一覧:

| Method | Path | 用途 |
|--------|------|------|
| GET | `/api/v1/scenes` | シーン一覧（limit/offset） |
| GET | `/api/v1/scenes/{token}` | シーン1件 |
| GET | `/api/v1/scenes/{token}/samples` | シーン内サンプル一覧 |
| GET | `/api/v1/scenes/{token}/ego-poses` | シーン内全 Ego Pose |
| GET | `/api/v1/samples/{token}` | サンプル1件 |
| GET | `/api/v1/samples/{token}/annotations` | サンプルのアノテーション一覧 |
| GET | `/api/v1/samples/{token}/sensor-data` | サンプルのセンサーデータマップ（channel→SensorDataBrief） |
| GET | `/api/v1/samples/{token}/instances` | サンプル内インスタンスサマリ一覧 |
| GET | `/api/v1/annotations` | アノテーション一覧（limit/offset） |
| GET | `/api/v1/annotations/{token}` | アノテーション1件 |
| PATCH | `/api/v1/annotations/{token}` | アノテーション部分更新 |
| GET | `/api/v1/calibrated-sensors` | キャリブレーション済みセンサー一覧 |
| GET | `/api/v1/sensor-data/{token}/image` | センサー画像バイナリ配信 |
| GET | `/api/v1/sensor-data/{token}/pointcloud` | 点群 JSON 配信 |
| GET | `/api/v1/maps` | マップ一覧 |
| GET | `/api/v1/maps/{token}/geojson` | マップ GeoJSON |
| GET | `/api/v1/maps/{location}/basemap` | ベースマップ画像バイナリ配信 |
| GET | `/api/v1/categories` | カテゴリ一覧（全件・ページネーションなし） |
| GET | `/api/v1/instances` | インスタンス一覧（scene_token/category_name フィルタ対応） |
| GET | `/api/v1/instances/{token}/annotations` | インスタンスの全アノテーション（timestamp 昇順） |
| GET | `/api/v1/instances/{token}/best-camera` | インスタンスが最もよく写るカメラチャンネルと sample_data_token |
| GET | `/api/v1/logs` | ログ一覧（location フィルタ対応） |

フルCRUD（POST/PUT/DELETE）は現時点では annotations の PATCH のみ実装。
将来的に POST/PUT/DELETE を追加する場合は各エンドポイントファイルに追記すること。

### ページネーション
```python
# 全GETリストエンドポイントで共通化
GET /api/v1/scenes?limit=50&offset=0
```

### LiDAR点群の形式
センサーデータ（LiDAR点群）はPotree形式に変換せず`.pcd.bin`バイナリ直接配信でよい
- フォーマット: float32 × 5列（x, y, z, intensity, ring_index）
- DBの fileformat カラム値: `pcd`
- APIレスポンス: JSON形式 `{"points": [[x,y,z,intensity], ...], "num_points": N}`

## Docker構成
### コンテナ一覧
プロジェクトルートの `docker-compose.yml` を参照。

### 環境変数（backend）
プロジェクトルートの `.env` を参照。

### 起動コマンド
```bash
make dev      # docker compose up --build
make migrate  # alembic upgrade head
make test     # pytest + vitest
```

## 実装上の制約
- SQLAlchemy 2.xの `Session` は `Annotated` + `Depends` でDI
- 非同期（async/await）を使用する（ドライバ: asyncpg）
- CORSは開発時 `*` 許可、本番は環境変数で制御
- テストDBは別コンテナ（postgresのみ、PostGIS不要）ではなく同一イメージを使う
- NuScenesのデータパスは環境変数 NUSCENES_DATAROOT で渡す
- map expansionのレイヤー（drivable_area, lane等）はGeoJSON形式でフロントに渡す

## 行動原則
- 3ステップ以上のタスクは必ずPlanモードで開始する
- コードを読まずに書かない。必ず既存コードを確認してから変更する

## よくある実装ミスの禁止事項
- RouterにDB変換ロジックを書かない → app/service/ と app/converters/ に集約
- Pydanticモデルをmodels/と独立して定義しない → schemas/はmodels/から派生
- ジオメトリをWKBのままAPIレスポンスに含めない → 必ずGeoJSONに変換
- 新リソース追加時は endpoints/ + service/ + repository/ + schemas/ をセットで追加する
