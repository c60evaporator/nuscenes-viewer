# nuscenes-viewer
[![license](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://github.com/c60evaporator/nuscenes-viewer/blob/main/LICENSE)
![Python](https://img.shields.io/badge/Python-3.12-blue?logo=python&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)

**自動運転向けnuScenesデータセットのための、Webブラウザで動く可視化・アノテーションツール。**

<div align="center">

[English](https://github.com/c60evaporator/nuscenes-viewer#nuscenes-viewer) | **日本語**

</div>

## デモ

<img src=images/screenshot_sample.png width=70%>

<img src=images/screenshot_samplemap.png width=70%>

## 機能一覧

nuscenes-viewerは、オープンソースのnuScenesデータセット可視化アプリです。以下の特徴を持ちます。

- **ユーザーフレンドリーなUI**
  シーン、サンプル、インスタンス、アノテーションなど、nuScenesデータセットの各要素を直感的に選択し、インタラクティブに可視化できます。これにより多数のデータの全体像と、個々のデータの詳細両方を、効率的に把握することができます。

- **多角的なアノテーション**
  BEV LiDAR画像とKonva.jsによる2Dバウンディングボックス操作、3D点群とUnityライクなUIによる3Dバウンディングボックス編集、その他GUIボタンやキーボードを用いて、アノテーションを多角的に視覚化、編集することができます。

- **Map expansion対応**
  nuScenes本体だけでなくMap expansion（HDマップ）も、インタラクティブなポリゴンとラインを用いて可視化する機能を持ちます。ただ2Dマップ上に表示するだけでなく、カメラ画像上に重ねて表示する機能も持ちます。これによりHDマップの全体像を効率よく把握することができます。

## 前提条件

- Docker & Docker Compose
- nuScenes dataset ([登録が必要](https://www.nuscenes.org/nuscenes#download))
- Chromeブラウザ

## DBのマイグレーション

```bash
docker compose up -d db
docker compose run --rm migrations   # initial + add_indexes の2マイグレーションが適用される          
```

## セットアップ
### 1. リポジトリのクローン

```bash
git clone https://github.com/c60evaporator/nuscenes-viewer.git
```

### 2. nuScenesデータの配置

以下のフォルダ構成で、nuScenesデータセットを設置するかシンボリックリンクを貼ってください。
（nuScenesデータセットのダウンロード方法は、[こちらを参照してください](nuscenes_download_ja.md)）。

```
root/
├── backend
:
└── data
    ├─ .gitkeep
    └─ nuscenes <- ここにnuScenesデータセットを置くかシンボリックリンクを貼ってください
        ├─ v1.0-mini
        ├─ v1.0-trainval (optional)
        ├─ samples
        ├─ sweeps
        └─ maps
            :
            └─ expansion <- Map expansion
```

上記以外にnuScenesデータセットを置いた場合も、`.env`内の`NUSCENES_DATAROOT`をデフォルトの`./data/nuscenes`から変更することで読込できます。

### 3. 環境変数の設定

リポジトリの`.env.example`を以下コマンドで`.env`にコピーします。

```bash
cp .env.example .env
```

`.env`に記載されている以下変数を、必要に応じて編集します

| Variable | Description | Default |
|---|---|---|
| `APP_ENV` | Runtime environment (`development` \| `production`) | `development` |
| `POSTGRES_USER` | DB user with DDL permissions (for migrations) | `nusc_migrator` |
| `POSTGRES_PASSWORD` | Password for `POSTGRES_USER` | **絶対に変更してください** |
| `POSTGRES_APP_USER` | DB user for the API (limited permissions) | `nusc_app` |
| `POSTGRES_APP_PASSWORD` | Password for `POSTGRES_APP_USER` | **絶対に変更してください** |
| `POSTGRES_DB` | Database name | `nusc_viewer` |
| `PGADMIN_EMAIL` | pgAdmin login email (dev only) | `pgadmin@sample.com` |
| `PGADMIN_PASSWORD` | pgAdmin login password (dev only) | `pgadmin` |
| `NUSCENES_DATAROOT` | Path to the nuScenes dataset on the host | `./data/nuscenes` |

> **Note:** In production, set `NUSCENES_DATAROOT` to an absolute path.
> `PGADMIN_*` variables are only used in development (`docker-compose.yml`) and ignored in production.

### 4. 起動

Launch all containers

For dev

```bash
make dev
```

For production

```bash
make prod
```

### 5. DBマイグレーションとnuScenesデータセットのインポート（初回起動時のみ）

このアプリは、最初にnuSceneデータセットのメタデータをDBに読み込む必要があります。例えばminiデータセットを使用する場合、以下コマンドを実行してDBのマイグレーションとメタデータのインポートを実施してください。

```bash
# Migration (make sure the db container is launched in advance)
make migrate
# Import Mini dataset
docker compose exec api python scripts/import_nuscenes.py --dataset-version v1.0-mini
# Import Map expansion
docker compose exec api python scripts/import_nuscenes_map.py
```

もしTrainvalデータセットを使用したい場合、2つめのコマンドを以下のように変更してください。

```bash
docker compose exec api python scripts/import_nuscenes.py --dataset-version v1.0-trainval
```

これでアプリのセットアップは完了です。ローカルでサーバーを立ち上げた場合、Chromeブラウザで`http://localhost:3000`アドレスを開くことでアプリにアクセスできます。

リモートにサーバーを立ち上げた場合、`http://{ホストアドレス}:3000`のように適切なアドレスを入力してアクセスしてください（ファイアウォール等の設定にも注意してください）。

## ロードマップ

- [ ] CAN bus expansion対応
- [ ] アノテーションのAIアシスト機能
    - [ ] BEVFormer等の3D物体検出によるBBoxアノテーション提案
    - [ ] 同一インスタンスの他のBBoxと明らかに位置や見た目が異なるアノテーションを追加しようとしたときの警告機能（一度登録してしまうと修正が面倒なため）
- [ ] 各種AIモデルの推論可視化と性能評価GUI
    - [ ] Detection画面（3D object detection）
    - [ ] Tracking画面（Multiple object tracking: MOT）
    - [ ] E2E画面（End-to-End自動運転モデル）
- [ ] VQAタスク支援

## コントリビュート

個人リポジトリですが、自動運転・nuScenesコミュニティの皆さんからの
改善提案・フィードバック・プルリクエストを歓迎しています。

### 貢献の方法

- **バグ報告** — 予期しない動作を見つけたら、Issueを開いてください。
- **機能提案** — アイデアがあればDiscussionやIssueでお気軽にどうぞ。
- **プルリクエスト** — 修正・改善の実装も大歓迎です。

### はじめ方

1. リポジトリをフォーク
2. フィーチャーブランチを作成（`git checkout -b feature/your-feature`）
3. 変更をコミット
4. プルリクエストを作成

### コミュニティ

研究やプロジェクトでnuscenes-viewerを使っていただけた場合は、
ぜひGitHub IssuesやDiscussionsで教えてください。

役に立ったと感じたら、⭐ をつけていただけると、より多くの人に届きます。

## ライセンス

このプロジェクトは[Apache 2.0 license](LICENSE)でリリースされています。
