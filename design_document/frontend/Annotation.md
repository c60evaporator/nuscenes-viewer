# アノテーション機能

アノテーション機能の仕様をこちらに記載。nuScenes本体（バウンディングボックス）とMap Expansion（）2種類のアノテーションが

1. Annotation画面：nuScenes本体のバウンディングボックスアノテーションの編集・追加
2. Sample&Map画面：Map Expansionアノテーションの編集・追加（ポリゴン、ライン、信号機）

の2種類のアノテーションを編集・追加します。まずは1について、どのようなtech stackを用いてどのような手順で実装するのが良いか提案してください

## 1. Annotation画面（nuScenes本体のアノテーション）

### アノテーション編集モード、追加モードへの遷移ボタン
Annotation画面の左ペインの最下部に、編集モード、追加モードに遷移するための以下の2つのボタンを設置

- 「Edit BBox」：現在選択されているバウンディングボックスアノテーションの**編集モード**に入る
- 「Add BBox」：新規バウンディングボックスアノテーションの**追加モード**に入る

以下のルールで有効・無効を切り替え

- Instanceフィルタ、Sampleフィルタどちらも「すべて」の場合
  - 「Add BBox」「Edit BBox」どちらも無効
- Sampleフィルタ適用時（Instanceフィルタは「すべて」）
  - バウンディングボックスを選択していない場合：「Add BBox」ボタンのみ有効
  - バウンディングボックスを選択している場合：「Add BBox」「Edit BBox」両方有効
- Instanceフィルタ適用時（Sampleフィルタは「すべて」）
  - バウンディングボックスを選択していない場合：「Add BBox」「Edit BBox」どちらも無効
  - バウンディングボックスを選択している場合：「Edit BBox」ボタンのみ有効（「Add BBox」は同じInstanceの重複を防ぐため無効化）

### 編集モード、追加モード中の操作

以下4通りの方法で、バウンディングボックスの位置や大きさ等を調整

- 右ペイン：translation, size, rotationや各種属性を直接編集する
- LIDAR_TOP画像：CVAT形式ベースのUI（後述）
- Three.js：UnityベースのUI（後述）

カメラ画像は表示専用とする（カメラ画像上でマウスクリックを用いたバウンディングボックス編集は行わない）

#### 右ペインによる操作

右ペインに、以下のようなアノテーション情報表示・編集用のコンポーネントを表示

- Bonding box ctrl（div）
  - 回転ボタン（ボタン）
    - 右回転（Ego-pose座標ではなくグローバル座標のz軸で上から見た時計回り回転）
    - 左回転（Ego-pose座標ではなくグローバル座標のz軸で上から見た反時計回り回転）
  - 並進ボタン（ボタン）
    - 上移動（LIDAR_TOP画像での上方向=Ego-pose座標系y正方向）
    - 下移動（LIDAR_TOP画像での下方向=Ego-pose座標系y負方向）
    - 左移動（LIDAR_TOP画像での左方向=Ego-pose座標系x負方向）
    - 右移動（LIDAR_TOP画像での右方向=Ego-pose座標系x正方向）
  - 拡大・縮小ボタン（ボタン）
    - W方向拡大（Ego-pose座標系y方向サイズ）
    - W方向拡縮小（Ego-pose座標系y方向サイズ）
    - L方向拡大（Ego-pose座標系x方向サイズ）
    - L方向拡縮小（Ego-pose座標系x方向サイズ）
    - H方向拡大（Ego-pose座標系z方向サイズ）
    - H方向拡縮小（Ego-pose座標系z方向サイズ）
- translation（テキストボックス）：選択したバウンディングボックス（SampleAnnotationテーブル）のtranslation
  - x
  - y
  - z
- size（テキストボックス）：選択したバウンディングボックスのsize
  - W
  - L
  - H
- rotation（テキストボックス）：選択したバウンディングボックスのrotation。元データはクオータニオンだが、オイラー角に変換して表示
  - yaw
  - pitch
  - roll
- visibility（プルダウンメニュー）：Visibilityテーブルのlevelのリストをプルダウン表示。デフォルト値は選択したバウンディングボックスのvisibility_tokenに基づく
- attributes（multiselect）：Attributeテーブルのnameのリストをmultiselect形式で表示。デフォルト値は選択したバウンディングボックスのattribute_tokensに基づく
- sample（プルダウンメニュー）：Sceneに含まれるSampleのリストをプルダウン表示。デフォルト値は選択したバウンディングボックスのsample_tokenに基づく
- instance（プルダウンメニュー）：Sceneに含まれるInstanceのリストに「new instance」を追加したものをプルダウン表示。デフォルト値は選択したバウンディングボックスのinstance_tokenに基づく。
- category（プルダウンメニュー）：Categoryテーブルのnameのリストをプルダウン表示。デフォルト値は選択したバウンディングボックスのinstance_tokenと、紐づいたInstandeのcategory_tokenに基づく
- token（テキスト表示のみ）：選択したバウンディングボックスのtokenを表示
- prev（テキスト表示のみ）：選択したバウンディングボックスのprevを表示
- next（テキスト表示のみ）：選択したバウンディングボックスのnextを表示
- num_lidar_pts（テキスト表示のみ）：選択したバウンディングボックスのnum_lidar_ptsを表示
- num_radar_pts（テキスト表示のみ）：選択したバウンディングボックスのnum_radar_ptsを表示
- Register the BBox（ボタン）：上記で指定した条件でバウンディングボックスを登録

各コンポーネントは、以下の条件で有効、無効を制御

- 編集・追加モードでないとき：全コンポーネントの入力を無効化。バウンディングボックス選択時に表示のみ実施
- 編集モードのとき：
  - 各ボタンの操作を有効化
  - translation、size、rotationのテキストボックス入力を有効化
  - visibility、sample、instanceのプルダウン選択を有効化
  - categoryのプルダウン選択は、instanceプルダウンで「new instance」を選択している場合のみ有効化。それ以外の場合は無効化
  - attributesのmultiselectを有効化
- 追加モードのとき：
  - 各ボタンの操作を有効化
  - translation、size、rotationのテキストボックス入力を有効化
  - visibility、sample、instanceのプルダウン選択を有効化
  - categoryのプルダウン選択は、instanceプルダウンで「new instance」を選択している場合のみ有効化。それ以外の場合は無効化
  - attributesのmultiselectを有効化

追加モードでは、

### LIDAR_TOP画面上でのBBOXの編集（編集モード・追加モード共通）

- マウスホイール動作：LIDAR画像全体のズーム
- マウスのパン：LIDAR画像全体のパン
- バウンディングボックス左クリック時：以下の操作を有効にする
  - キーボードの「G」キー：マウスを動かすとバウンディングボックスをXY平面上で動かすモードに
    - キーボードの「X」キー：バウンディングボックスが動く方向をX軸に制限
    - キーボードの「Y」キー：バウンディングボックスが動く方向をY軸に制限
  - キーボードの「R」キー：マウスを動かすとバウンディングボックスが回転するモードに（Z軸周りのみ回転）
  - キーボードの「S」キー：マウスを動かすとバウンディングボックスの大きさを変えるモードに
    - キーボードの「X」キー：バウンディングボックスの大きさ変更をX軸方向に制限
    - キーボードの「Y」キー：バウンディングボックスの大きさ変更をY軸方向に制限
  - 左クリック：バウンディングボックスの位置、大きさ、回転を確定（カメラ画像、のバウンディングボックス位置を更新）
  - 右クリック or 「Esc」キー：キャンセル
  - キーボードの「R」キーを押しながらマウスホイール動作：バウンディングボックスの回転
  - キーボードの「S」キーを押しながらマウスホイール動作：バウンディングボックスのスケール微調整
  - キーボードの「A」キーを押しながらマウスホイール動作：バウンディングボックスのアスペクト比変更

左クリックでバウンディングボックスの位置を確定するまで、他のビュー（カメラ画像）

### 登録時のバリデーション

- 登録を受け付けないケース
  - sample_tokenと一致するsampleが存在しない
  - instance_tokenと一致するinstanceが存在しない
  - prevと一致するsample_annotationが存在しない（空欄の場合を除く）
  - prevが空欄だが、自身よりも前のsampleに同じinstanceのsample_annotationが存在する
  - nextと一致するsample_annotationが存在しない（空欄の場合を除く）
  - nextが空欄だが、自身よりも後のsampleに同じinstanceのsample_annotationが存在する
  - 

- 警告を出すケース
  - 同じinstanceでsampleが不連続な（間のサンプルが抜けている）場合


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
う
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


