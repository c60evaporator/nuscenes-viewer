# アノテーション機能

アノテーション機能の使用をこちらに記載

可視化機能の実装が完了したので、アノテーション機能を追加したいです。具体的には

1. Annotation画面：nuScenes本体のバウンディングボックスアノテーションの編集・追加
2. Sample&Map画面：Map Expansionアノテーションの編集・追加（ポリゴン、ライン、信号機）

の2種類のアノテーションを編集・追加します。まずは1について、どのようなtech stackを用いてどのような手順で実装するのが良いか提案してください

## 1. Annotation画面（nuScenes本体のアノテーション）

### 画面仕様
Annotation画面の左ペイン下側の現在Instanceリストor

#### Sampleフィルタ適用時
左ペインのSampleフィルタを適用している場合（Sample画面の「Annotations」ボタンから遷移した時が典型的）
- インスタンス（バウンディングボックス）を選択していない場合：「Add」ボタンのみ

#### Instanceフィルタ適用時
左ペインのSampleフィルタを適用している場合（Instance画面から遷移した場合）

### 設定ファイル
`frontend/config/settings.yml`に`annotation`項目を作りアノテーションに関係した設定を記述

#### categories
BBOXで選択できるカテゴリ（ラベル）と`default_size`（選択時にBBOXを妥当なサイズで生成する役割）、`color`を、以下のようにリスト指定できるようにする

```yaml
annotation:
  categories:
    - name: vehicle.car
      default_size: [1.8, 4.6, 1.5]   # width, length, height
      color: "#FF6B6B"
    - name: vehicle.truck
      default_size: [2.5, 8.0, 3.2]
      color: "#4ECDC4"
    - name: human.pedestrian.adult
      default_size: [0.6, 0.6, 1.7]
      color: "#FFE66D"
    - name: vehicle.bicycle
      default_size: [0.6, 1.8, 1.4]
      color: "#95E1D3"
```

カテゴリ名は **元データの `category` テーブルに存在すること** をバックエンドで検証する。settings.ymlにあってDBにない場合はAPI側で 400 を返す。逆にDBにあってymlにないカテゴリは「使えるが新規作成では選択肢に出ない」という扱い。

### API

アノテーション編集には以下のエンドポイントを使用

| Method | Path | 用途 |
|--------|------|------|
| PATCH | `/api/v1/annotations/{token}` | 部分更新 (translation/size/rotationのみ等) |
| POST | `/api/v1/annotations` | 新規BBox作成 (sample_token必須) |
| GET | `/api/v1/annotations/{token}/history` | 編集履歴取得 |



### DB

#### アノテーション保存用テーブル

元の`sample_annotation`テーブルは変更せず、編集・追加したアノテーションは以下の新規テーブル`annotation_edits`に保存する

| カラム | 型 | 説明 |
|---|---|---|
| `token` | UUID PK | 編集レコード固有ID |
| `original_token` | str FK | 元のsample_annotation.token (新規作成時はNULL) |
| `sample_token` | str FK | 所属するsample (新規作成時に必要) |
| `instance_token` | str FK | インスタンス (新規作成時はNULL or 新規instance生成) |
| `category_token` | str FK | カテゴリ (settings.ymlのカテゴリ名 → DBで解決) |
| `translation` | float[3] | x, y, z |
| `size` | float[3] | width, length, height |
| `rotation` | float[4] | quaternion (w, x, y, z) |
| `edit_type` | enum | `'modified'` / `'created'` / `'deleted'` |
| `version` | int | 楽観的ロック用 |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

#### 読み取り時の合成ロジック

Annotation関係のエンドポイント（`/api/v1/annotations`等）では、以下のように**元データ + 編集差分 をマージ**して返す

```
元の SampleAnnotation 一覧を取得
  ↓
annotation_edits に対応するレコードがあれば差分で上書き
  ↓
edit_type='deleted' のものは除外
  ↓
edit_type='created' のものを追加
  ↓
APIレスポンスとして返却
```

これにより、フロントエンドは「編集後の状態」だけを意識すればよく、可視化ロジックを大きく変えずに済む

## 2. カテゴリのsettings.yml管理

### ファイル配置

```
frontend/
├── config/
│   └── settings.yml      ← カテゴリリスト等
└── src/
    └── config/
        └── settings.ts   ← Vite buildtime読み込み
```

### バックエンドとの整合性



## 3. Undo/Redo (クライアント側のみ)

### Zustandストア構造

```typescript
interface EditStore {
  // 現在の編集中BBox状態
  workingAnnotations: Map<string, BBox>;

  // Undo/Redo履歴
  history: BBoxSnapshot[];
  historyIndex: number;

  // アクション
  applyEdit: (token: string, changes: Partial<BBox>) => void;
  undo: () => void;
  redo: () => void;
  commit: () => Promise<void>;  // サーバへ送信
}
```

### 履歴の単位

「Transformコントロール操作1回 = 1スナップショット」とするのが直感的です。`TransformControls` の `onMouseUp` (ドラッグ終了) でスナップショット記録。

### 上限と破棄

- 上限 50ステップ程度 (FIFO)
- セッション切替 (別sampleへ移動) 時はクリア、または「未保存の変更があります」警告


## 5. 注意点・落とし穴

**(1) `instance_token` の扱い**
新規BBoxを作成した場合、nuScenesの `instance` テーブルにレコードを追加すべきか、編集差分テーブル内で完結させるか決める必要があります。後者の方が「元データ非破壊」原則に忠実なので、`annotation_edits` 内に `synthetic_instance_token` を持たせて自己完結させるのを推奨します。

**(2) 楽観的ロックの粒度**
複数人で同じBBoxを同時編集する想定なら `version` チェック必須ですが、個人利用なら省略してもOKです。要件次第。

**(3) TransformControlsとOrbitControlsの干渉**
`TransformControls` 操作中は `OrbitControls` を無効化する必要があります (drei の TransformControls には `dragging-changed` イベントがあるのでそれで制御)。これは地味にハマりポイントです。

**(4) 座標系の確認**
nuScenesのBBoxは **エゴ車両座標系 vs グローバル座標系** のどちらで保存されているか確認してください。`TransformControls` で操作する座標とDBの座標を一致させる必要があります。元データは `sample_annotation.translation` がグローバル座標 (map座標系) のはずなので、可視化時にエゴ座標に変換しているなら、保存時に逆変換が必要です。


