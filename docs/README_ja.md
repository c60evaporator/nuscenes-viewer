# nuscenes-viewer
[![license](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://github.com/c60evaporator/nuscenes-viewer/blob/main/LICENSE)
![Python](https://img.shields.io/badge/Python-3.12-blue?logo=python&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)

**自動運転向けnuScenesデータセットのための、Webブラウザで動く可視化・アノテーションツール。**

<div align="center">

[English](README.md) | 日本語

</div>

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

## ロードマップ

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
