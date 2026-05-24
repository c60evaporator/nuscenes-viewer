# nuscenes-viewer
[![license](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://github.com/c60evaporator/nuscenes-viewer/blob/main/LICENSE)
![Python](https://img.shields.io/badge/Python-3.12-blue?logo=python&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
[![Demo](https://img.shields.io/badge/Demo-Live-brightgreen?logo=amazon-aws)](https://dtq47wxfkxb2n.cloudfront.net)

**自動運転向けnuScenesデータセットのための、Webブラウザで動く可視化・アノテーションツール。**

<div align="center">

[English](https://github.com/c60evaporator/nuscenes-viewer#nuscenes-viewer) | **日本語**

</div>

## デモ

🌐 **[Live Demo](https://dtq47wxfkxb2n.cloudfront.net)** — nuScenes mini dataset

> ⚠️ このデモは[nuScenes dataset](https://www.nuscenes.org/nuscenes)を[nuScenes license](https://www.nuscenes.org/terms-of-use)のもとで使用しています
> デモアプリは予期せず停止することがあることをご了承ください

**可視化デモ**

<img src=images/demo_visualization.gif width=70%>

**アノテーションデモ**

<img src=images/demo_annotation.gif width=70%>

## 機能一覧

nuscenes-viewerは、オープンソースのnuScenesデータセット可視化アプリです。以下の特徴を持ちます。

- **ユーザーフレンドリーなUI**
  シーン、サンプル、インスタンス、アノテーションなど、nuScenesデータセットの各要素を直感的に選択し、インタラクティブに可視化できます。これにより多数のデータの全体像と、個々のデータの詳細両方を、効率的に把握することができます。

<img src=images/screenshot_sample.png width=40%>

- **多角的なアノテーション**
  BEV LiDAR画像とKonva.jsによる2Dバウンディングボックス操作、3D点群とUnityライクなUIによる3Dバウンディングボックス編集、その他GUIボタンやキーボードを用いて、アノテーションを多角的に視覚化、編集することができます。

- **Map expansion対応**
  nuScenes本体だけでなくMap expansion（HDマップ）も、インタラクティブなポリゴンとラインを用いて可視化する機能を持ちます。ただ2Dマップ上に表示するだけでなく、カメラ画像上に重ねて表示する機能も持ちます。これによりHDマップの全体像を効率よく把握することができます。

<img src=images/screenshot_samplemap.png width=40%>

## 前提条件

- Docker & Docker Compose
- nuScenes dataset ([登録が必要](https://www.nuscenes.org/nuscenes#download))
- Chromeブラウザ

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
| `APP_ENV` | 環境選択 (`development` \| `production`) | `development` |
| `DEPLOY_ENV` | デプロイ環境 (`local` \| `aws`) | `local` |
| `POSTGRES_USER` | マイグレーション用のユーザー名（DDLパーミッションあり） | `nusc_migrator` |
| `POSTGRES_PASSWORD` | `POSTGRES_USER`のパスワード | **絶対に変更してください** |
| `POSTGRES_APP_USER` | API用のユーザー名（制限されたパーミッション） | `nusc_app` |
| `POSTGRES_APP_PASSWORD` | `POSTGRES_APP_USER`のパスワード | **絶対に変更してください** |
| `POSTGRES_DB` | PostGISのデータベース名 | `nusc_viewer` |
| `PGADMIN_EMAIL` | pgAdminログイン用のemail (dev only) | `pgadmin@sample.com` |
| `PGADMIN_PASSWORD` | pgAdminログイン用のpassword (dev only) | **変更してください** |
| `NUSCENES_DATAROOT` | Path to the nuScenes dataset on the host | `./data/nuscenes` |

> `APP_ENV`が`production`のとき、`NUSCENES_DATAROOT`は絶対パスを指定してください
> AWSデプロイ時は`NUSCENES_DATAROOT`は不要です
> `APP_ENV`が`production`のとき、`PGADMIN_*`は使用されません

### 4. 起動

以下コマンドでコンテナを起動します。

起動前に必要な初期化スクリプトの実行権限は、`make dev` と `make prod` の中で自動付与されます。

dev（開発構成）の場合

```bash
make dev
```

production（製品向け構成）の場合

```bash
make prod
```

Makefile を使わずに `docker compose up` を直接実行する場合は、先に以下を実行してください。

```bash
chmod +x db/initdb.d/*.sh
```

### 5. DBマイグレーション

以下コマンドでデータベースのテーブルを作成します

```bash
# Migration (あらかじめ`make dev`でdbコンテナを起動させておく)
make migrate
```

### 6. nuScenesデータセットのインポート

nuSceneデータセットのメタデータを実際にDBに読み込みます。例えばminiデータセットを使用する場合、以下コマンドを実行して本体とMap expansionのメタデータをインポートします

```bash
# Import Mini dataset
docker compose exec api python scripts/import_nuscenes.py --dataset-version v1.0-mini
# Import Map expansion
docker compose exec api python scripts/import_nuscenes_map.py
```

Trainvalデータセットを使用したい場合は、2つめのコマンドを以下のように変更してください（Trainvalデータセットはサイズが大きいため、数十分かかることもあります）。

```bash
docker compose exec api python scripts/import_nuscenes.py --dataset-version v1.0-trainval
```

これでアプリのセットアップは完了です。ローカルでサーバーを立ち上げた場合、Chromeブラウザで`http://localhost:3000`アドレスを開くことでアプリにアクセスできます。

リモートにサーバーを立ち上げた場合、`http://{ホストアドレス}:3000`のように適切なアドレスを入力してアクセスしてください（ファイアウォール等の設定にも注意してください）。

## 使い方

> 💡 **クイックスタート**: マップを選択 → シーンを選択 → "Samples"をクリック

---

### 可視化

#### Scene — 走行シナリオの閲覧と探索

<img src=images/usage_scene.gif width=70%>

左上のドロップダウンメニューからマップを選択し、リストからシーンを選択します。
各シーンには約40サンプル（約20秒分の走行データ）が含まれています。
右下の各ボタンから、以下の詳細画面に移ることができます。

| ボタン | 表示内容 |
|--------|----------|
| **Samples** | カメラ画像・LiDAR/RADARの点群・バウンディングボックスアノテーション |
| **Instances** | シーン全体のタイムラインにわたる全追跡オブジェクト |
| **Sample & Map** | HDマップ上に重ねたセンサーデータ |

---

#### Sample — フレームごとのセンサーデータの確認

<img src=images/usage_sample.gif width=70%>

左ペインの**スライダー**またはリストをクリックしてフレームを移動します。

- **バウンディングボックスをクリック**、または右ペインのインスタンスリストをクリックすると、全センサー上で同時にオブジェクトがハイライトされます
- インスタンスリストを**ダブルクリック**するとInstance画面に移動します
- **"Annotations"をクリック**すると現在のフレームのアノテーション編集画面が開きます

---

### アノテーション（バウンディングボックス）

<img src=images/annotation.png width=60%>

画面上の"**Annotations**"タブ、またはSample画面の"**Annotations**"ボタンからアノテーション編集画面を開き、以下の操作でアノテーションを編集できます

- 左ペインのリストまたはカメラ・LIDAR_TOP・上のバウンディングボックスを選択し、「Edit BBox」ボタンで既存BBoxの編集開始
- 「Add BBox」または「Add BBox to prev/next」で新規BBoxの追加開始
- 編集中は「Save BBox」で保存、「Cancel Edit」で破棄

編集操作には以下4種類の方法を利用できます。

1. **LIDAR_TOP (BEV)**: マウスドラッグで並進、ハンドルでリサイズ・回転
2. **3D点群**: ハンドルのドラッグまたはUnity風ギズモでサイズ変更・回転
3. **右ペインのボタン**: 移動・拡大縮小・回転ボタンでステップごとに編集、または数値入力欄に直接値を指定
4. **キーボード**: ショートカットキーで並進・回転・サイズ変更

各操作はリアルタイムで全ビュー（LIDAR_TOP / カメラ画像 / 3D点群 / 右ペイン数値）に同期されます。

#### 1. LIDAR_TOP (BEV)

<img src=images/annotation_bev.png width=40%>

LIDAR_TOPの上面ビュー上に表示されるオレンジ色の矩形枠で編集します。

| 操作 | 動作 |
|---|---|
| 矩形内をドラッグ | 並進移動（z座標は変化しません） |
| 角または辺中央のアンカーをドラッグ | リサイズ（中心固定、width/lengthのみ変更、heightは不変） |
| 矩形上方の回転ハンドルをドラッグ | z軸回転（yaw） |
| 矩形外の空白部分をドラッグ | パン（視点移動） |
| マウスホイール | ズーム |

#### 2. 3D点群

<img src=images/annotation_three.png width=40%>

3Dビュー内では、編集中BBoxにTransformControlsのギズモを表示して並進・回転できます。

| 操作 | 動作 |
|---|---|
| マウスを3Dビュー内に置く + `W`キー | 並進モード（矢印ハンドル表示） |
| マウスを3Dビュー内に置く + `E`キー | 回転モード（リングハンドル表示） |
| 矢印ハンドルをドラッグ（並進モード） | 該当軸方向に並進（X=赤=前方、Y=緑=左、Z=青=上） |
| リングハンドルをドラッグ（回転モード） | 該当軸まわりに回転（3軸自由：yaw/pitch/roll） |
| ギズモ以外の空白をドラッグ | 視点回転 |
| 右クリックドラッグ | 視点パン |
| マウスホイール | ズーム |

3D点群ではリサイズ（サイズ変更）はできません。サイズ変更はLIDAR_TOP・右ペイン・キーボードで行ってください。

#### 3. 右ペインのボタン

<img src=images/annotation_button.png width=30%>

右ペインの「Bounding box ctrl」エリアに12個のボタンが配置されています。各ボタンはクリックで1ステップ、長押しで連続実行されます（リリース時に履歴1ステップ）。

| ボタン | 動作 |
|---|---|
| ↺ / ↻ | グローバルz軸まわりに5度回転（反時計/時計） |
| ▲ / ▼ / ► / ◄ | ego座標系で0.1m並進（前/後/右/左） |
| +W / -W | width方向に0.1m拡大/縮小（中心固定） |
| +L / -L | length方向に0.1m拡大/縮小（中心固定） |
| +H / -H | height方向に0.1m拡大/縮小（下面固定、上面のみ移動） |

また、translation・size・rotationの数値入力欄に直接値を入力してEnter（またはフォーカス離脱）で確定できます。Escapeでキャンセル。

#### 4. キーボード

編集セッション中、フォームへの入力中以外であれば以下のショートカットが有効です。

| キー | 動作 |
|---|---|
| `→` | ego_x+ 方向に並進 (画面右、進行方向) |
| `←` | ego_x- 方向に並進 |
| `↑` | ego_y+ 方向に並進 (画面上、左方向) |
| `↓` | ego_y- 方向に並進 |
| `U` | ego_z+ 方向に並進 (上) |
| `O` | ego_z- 方向に並進 (下) |
| `I` | length 方向に拡大 (+L) |
| `K` | length 方向に縮小 (-L) |
| `J` | width 方向に拡大 (+W) |
| `L` | width 方向に縮小 (-W) |
| `M` | グローバルz軸で反時計回り回転 (左回転) |
| `.` | グローバルz軸で時計回り回転 (右回転) |
| `Shift + 各キー` | 大きいステップ (10倍) |
| `Ctrl+Z`(Windows) / `Cmd+Z`(Mac) | 元に戻す |
| `Ctrl+Y`(Windows) / `Cmd+Shift+Z`(Mac) | やり直し |

キーを押しっぱなしにすると連続実行されます。

---

### アノテーション（Map Expansion）

Comming soon

---

### データベース操作

#### マイグレーション (データベーススキーマのアップデート)

本ツールの将来のアップデート等で、データベーススキーマのアップデートが必要な場合、以下コマンドでマイグレーションを実行します。

```bash
docker compose run -v ./backend/alembic:/app/alembic --rm migrations alembic upgrade head
```

#### データベースの削除と再インポート

データベースを削除して他のデータをインポートしたい場合もあると思います。
この場合、以下コマンドでデータベースを削除し

```bash
docker compose down -v
```

以下コマンドでマイグレーションとデータセットの読込を実施します。

```bash
# Launch the system
make dev
# Migration
make migrate
# Import Mini dataset (データセット名を適宜`v1.0-trainval`等に変えてください)
docker compose exec api python scripts/import_nuscenes.py --dataset-version v1.0-mini
# Import Map expansion
docker compose exec api python scripts/import_nuscenes_map.py
```

## ロードマップ

- [ ] Map expansionのアノテーション
- [ ] CAN bus expansion対応
- [ ] アノテーションのAIアシスト機能
    - [ ] BEVFormer等の3D物体検出によるBBoxアノテーション提案
    - [ ] 同一インスタンスの他のBBoxと明らかに位置や見た目が異なるアノテーションを追加しようとしたときの警告機能（一度登録してしまうと修正が面倒なため）
    - [ ] バウンディングボックスの底面を最寄りのバウンディングボックスに合わせる機能（高さ合わせが大変なため）
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
