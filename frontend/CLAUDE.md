# frontend
nuscenes-viewerのフロントエンド

## UI Overview
- Mapを画面左上の`Map Selection`プルダウンメニューで選択し、Map内のリソース（Scene, Sample, Instance, Annotation, Map）を表示するWebアプリ
- 表示するリソースの種類を画面上側のタブで切り替え、それぞれ別画面で表示する
- リソース表示用画面はScene, Sample, Instance, Annotation, Map, Sample&Mapの6種類（各画面の詳細は後ほど記載）
- Map上に表示されたポリゴン、ライン、ポイント、およびカメラやLiDAR画面上に表示されたアノテーション（バウンディングボックス）はクリックで選択できるようにする

## Tech Stack
- 描画:      Deck.gl 9.x
- UI:        React 19 + TypeScript 5.x + Vite 6.x
- スタイル:  Tailwind CSS 4.x + shadcn/ui
- 状態管理:  Zustand 5.x
- API通信:   TanStack Query（@tanstack/react-query）5.x
- フォーム:  React Hook Form 7.x + Zod 3.x（アノテーション編集部分）
- テスト:    Vitest 3.x

## API
- baseURL: /api/v1
- クライアント: src/api/client.ts の apiFetch を必ず経由する
- コンポーネントから直接fetchを呼ばない

## レイアウト共通仕様
- 全体: 3ペイン構成（左280px固定 / 中央flex / 右280px固定）
- ヘッダー: 上部固定バー（黒背景）
  - 左端: Map Selectionプルダウン
  - 残り: Scene/Sample/Instance/Annotation/Map/Sample&Map タブ
  - アクティブタブは青文字
- 左ペイン: 上部フィルタ群（濃いグレー背景） + リスト（白背景・枠線あり）
- 右ペイン: テキスト情報エリア + 下部にアクションボタン（青）
- ボタン色: #4A90D9（青）
- フィルタUI背景色: #606060（濃いグレー）

### 中央ペイン（メインエリア）分割パターン
- パターンA（全面）: Scene, Sample, Map
- パターンB（上2/3 + 下1/3）: Instance, Annotation, Sample&Map

## 各画面の仕様
### 1. Scene
- `Map Selection`プルダウンメニューで選択したMapに紐づくScene情報を表示する
- 左側のペインにSceneの一覧をリスト表示（ソートは名前順）。クリックで特定のSceneを選択できるようにする
- 左側のペイン上側にプルダウンメニューのLogフィルタを設置し、リスト表示のSceneを絞れるようにする（フィルタなしをデフォルトの選択肢にする）
- 中央のメイン画面に、左側のペインでクリック選択したSceneの全てのSampleのEgo poseの点を、地図の画像（`$NUSCENES_DATAROOT/maps`直下の対応するpng）上に点の集合として表示（最初と最後の点だけ色を変えて"Start", "End"と表記）
- 右側のペインに、左側のペインで選択したSceneの情報を表示（token, description等のAPIのフィールド情報）
- 右側のペイン下部に`Samples`と`Instances`と`Sample&Map`ボタンを設置し、それぞれを押すとSceneでフィルタをかけた「Sample」画面、「Instance」画面、「Sample&Map」画面に遷移するようにする

### 2. Sample
- `Map Selection`プルダウンメニューで選択したMapに紐づくSample情報を表示する
- 左側のペインにSampleの一覧をリスト表示（ソートはtimestamp昇順）。クリックで特定のSampleを選択できるようにする
- 左側のペイン上側にプルダウンメニューのSceneフィルタを設置し、リスト表示対象のSampleを絞れるようにする。デフォルト値は最初のScene。Scene画面から`Samples`ボタンで遷移した場合、このフィルタは変更できないようにする（操作するためには一度画面上側のタブで別画面に遷移する必要がある）
- 中央のメイン画面に、左側のペインでクリック選択したSampleのアノテーションを表示
- 中央のメイン画面に表示するのはEGO_POINT, LIDAR_TOP, FUSED_RADER, CAM_FRONT_LEFT, CAM_FRONT, CAM_FRONT_RIGHT, CAM_BACK_LEFT, CAM_BACK, CAM_BACK_RIGHT。全部で9種類の情報があるので、3x3の9分割で表示する
- EGO_POSEは上段左に表示、Scene画面の地図上に表示したEgo poseの集合と基本的には同様の表示で、そのサンプルに該当する点を大きくして色も変えて強調する
- LIDAR_TOPは上段中に表示。上から見たLiDAR点群上にアノテーションのバウンディングボックスを重ねて表示（nuscenes-devkitの`render_sample_data(sample['data']['LIDAR_TOP'], nsweeps=変数, underlay_map=True)`メソッドと同様の表示）。nsweepsに相当する変数は設定として外出ししておく
- FUSED_RADERは上段中に表示。上から見たLiDAR点群上にアノテーションのバウンディングボックスを重ねて表示（nuscenes-devkitの`render_sample_data(sample['data']['FUSED_RADER'], nsweeps=変数, underlay_map=True)`メソッドと同様の表示）。nsweepsに相当する変数は設定として外出ししておく
- CAM_FRONT_LEFTは中段左に表示。カメラ画像上にアノテーションのバウンディングボックスを表示（nuscenes-devkitの`render_sample_data(sample['data']['CAM_FRONT_LEFT'])`メソッドと同様の表示）。
- 同様にCAM_FRONTを中段中、CAM_FRONT_RIGHTを中段右、CAM_BACK_LEFTを下段左、CAM_BACKを下段中、CAM_BACK_RIGHTを下段右に表示
- バウンディングボックスはクリックできるようにする。クリックするとインスタンス情報を表示
- 将来的にLiDARやRADERなし、あるいはカメラ台数が変わった場合も想定した実装にしておく
- 右側のペインに、左側のペインで選択したSampleの情報を表示（token, timestamp等のAPIのフィールド情報、およびSampleに含まれるInstanceのリスト）。
- Instanceのリストは選択できるようにし、ダブルクリックすることで選択したInstanceのCategoryでフィルタを掛けた「Instance」画面に遷移するようにする
- 右側のペイン下部に`Annotations`ボタンを設置し、押すとSceneとSampleでフィルタをかけた「Annotations」画面に別ウィンドウで遷移するようにする

#### Sample画面 右ペイン
- 上部: サンプル情報（flex: 1）
- 中部: instance list（flex: 1、スクロール可。ダブルクリックでInstance画面に遷移）
- 下部: Annotations ボタン

### 3. Instance
- `Map Selection`プルダウンメニューで選択したMapに紐づくInstance情報を表示する
- 左側のペインにInstanceの一覧をリスト表示（ソートはカテゴリ→名前順）。クリックで特定のInstanceを選択できるようにする
- 左側のペイン上側にプルダウンメニューのSceneフィルタを設置し、リスト表示対象のInstanceを絞れるようにする。デフォルト値は最初のScene。Scene画面から`Instances`ボタンで遷移した場合、このフィルタは変更できないようにする（操作するためには一度画面上側のタブで別画面に遷移する必要がある）
- Sceneフィルタの下にCategoryフィルタを設置（フィルタなしをデフォルトの選択肢にする）
- 左側のペイン下部には、選択インスタンスを含むサンプルを選択するためのSliderを設置（サンプルは時間順で並び替える）。このSliderで選択されたサンプルのアノテーションを、中央のメイン画面で表示する
- 中央のメイン画面は上3分の2と下3分の1で2分割する。上側には、左側のペインでクリック選択したインスタンスの、最初or真ん中or最後のサンプルのアノテーションを表示
- サンプルのアノテーション表示は左右均等2分割し、左側にはLIDAR_TOP上に重ねて表示、右側には最もよく写っているカメラ画像上に重ねて表示する（nuscenes-devkitの`nusc.render_instance()`メソッドと同様の表示）。
- 中央のメイン画面下側は左右2分割し、左側半分には、地図の画像（`$NUSCENES_DATAROOT/maps`直下の対応するpng）全体上に、上側でアノテーションを表示しているサンプルのEgo poseを赤い点で表示
- メイン画面下側の右側半分は、選択インスタンスを含む全サンプルのEgo poseの点を、地図の画像（`$NUSCENES_DATAROOT/maps`直下の対応するpng）上に点の集合として、点が存在する範囲のみを切り出して表示。上側でアノテーションを表示しているサンプルのEgo poseは強調表示する。
- 右側のペインに、左側のペインで選択したSampleの情報を表示（category_token, nbr_annotations等のAPIのフィールド情報、およびカテゴリ名）
- 右側のペイン下部に`Annotations`ボタンを設置し、押すとSceneとInstanceでフィルタをかけた「Annotations」画面に別ウィンドウで遷移するようにする

### 4. Annotation
- `Map Selection`プルダウンメニューで選択したMapに紐づくAnnotation情報を表示する
- 左側のペインにAnnotationの一覧をリスト表示（ソートはカテゴリ→名前順）。クリックで特定のAnnotationを選択できるようにする
- 左側のペイン上側にプルダウンメニューのSceneフィルタを設置し、リスト表示対象のInstanceを絞れるようにする。デフォルト値は最初のScene。Sample画面またはInstance画面から`Annotations`ボタンで遷移した場合、このフィルタは変更できないようにする（操作するためには一度画面上側のタブで別画面に遷移する必要がある）
- Sceneフィルタの下にSampleフィルタを設置（`Annotations`ボタンで遷移していない場合、フィルタなしをデフォルトの選択肢にする）。Sample画面から`Annotations`ボタンで遷移した場合、このフィルタは変更できないようにする（操作するためには一度画面上側のタブで別画面に遷移する必要がある）
- Sampleフィルタの下にCategoryフィルタを設置（フィルタなしをデフォルトの選択肢にする）
- Categoryフィルタの下にInstanceフィルタを設置（`Annotations`ボタンで遷移していない場合、フィルタなしをデフォルトの選択肢にする）。Instance画面から`Annotations`ボタンで遷移した場合、このフィルタは変更できないようにする（操作するためには一度画面上側のタブで別画面に遷移する必要がある）
- 中央のメイン画面は上3分の2と下3分の1で2分割する。上側は左右2分割し、アノテーションを表示。左側にはLIDAR_TOP上に重ねて表示、右側には最もよく写っているカメラ画像上に重ねて表示する
- 中央のメイン画面下側は左右均等2分割し、左側半分にはInstance画面と同様、地図の画像（`$NUSCENES_DATAROOT/maps`直下の対応するpng）全体上に、上側でアノテーションを表示しているサンプルのEgo poseを赤い点で表示
- メイン画面下側の右側半分は、将来的なアノテーションツールのための予約スペース（現時点では何も表示なしでOK）
- バウンディングボックスは将来的にこの画面で修正できることを想定（現時点では修正機能なしで表示だけでOK）
- 右側のペインに、左側のペインで選択したAnnotationの情報を表示（translation, rotation等のAPIのフィールド情報、およびカテゴリ名）

### 5. Map
- `Map Selection`プルダウンメニューで選択したMapのアノテーション（Map Expansion）を表示する
- ポリゴンで表示するアノテーションは、drivable_area,road_segment,road_block,lane,lane_connector,carpark_area,stop_line,ped_crossing,walkway
- ラインで表示するアノテーションは、road_divider,lane_divider
- ポイントで表示するアノテーションはtraffic_light
- これらのアノテーションのポリゴン、ライン、ポイントは、クリックできるようにする
- 左側のペイン上側に、Map情報（version, canvas_edge等）を表示
- 左側のペイン下側に、表示するアノテーションの種類のチェックボックスを配置。デフォルトではroad_segment,lane,road_divider,lane_divider,ped_crossingのみをチェックし、残りはチェックされていない状態にする
- 中央のメイン画面に、地図の画像（`$NUSCENES_DATAROOT/maps`直下の対応するpng）上にアノテーションを重ねて表示し、マウスホイールで地図を拡大縮小できるようにする
- アノテーションの凡例はUIコンポーネントとして地図とは別に置く
- 右側のペインに、中央のメイン画面でクリックしたアノテーションの情報を表示（DBにおける各カラム情報＋ポリゴンなら面積。ラインなら長さ）

### 6. Sample&Map
- `Map Selection`プルダウンメニューで選択したMapに紐づくSampleのセンサ画像（カメラまたはLiDARまたはRADER）上に、Mapのアノテーション（Map Expansion）を重ねて表示する
- ポリゴン、ライン、ポイントで表示するアノテーションはMap画面と同じ
- これらのアノテーションのポリゴン、ライン、ポイントは、クリックできるようにする
- アノテーションの凡例はUIコンポーネントとして別に置く
- traffic_lightは、カメラ画像の地面上にPointを表示した上で、properties.itemsの中のRED、YELLOW、GREENのCIRCLEとGREENの矢印も表示する
- 左側のペインにSampleの一覧をリスト表示（ソートはtimestamp昇順）。クリックで特定のSampleを選択できるようにする
- 左側のペイン上側にプルダウンメニューのSceneフィルタを設置し、リスト表示対象のSampleを絞れるようにする。デフォルト値は最初のScene。Scene画面から`Sample&Map`ボタンで遷移した場合、このフィルタは変更できないようにする（操作するためには一度画面上側のタブで別画面に遷移する必要がある）
- Sampleリストの下にSensorフィルタを設置。ここで選択したセンサの画像を中央のメイン画面に表示（CAM_FRONTをデフォルトの選択肢にする）
- 左側のペイン下側に、表示するアノテーションの種類のチェックボックスを配置。デフォルトではroad_segment,lane,road_divider,lane_divider,ped_crossingのみをチェックし、残りはチェックされていない状態にする
- 中央のメイン画面は上3分の2と下3分の1で2分割する。上側にSensorフィルタで選択したセンサ画像上に、先ほどのチェックボックスで選択したアノテーションを重ねて表示する
- メイン画面下側は左右2分割し、左側半分には先ほどのチェックボックスで選択したアノテーションを表示し、その上に左側のペインでクリック選択したSceneの全てのSampleのEgo poseの点を重ねて表示する
- メイン画面下側の右側半分は、将来的なアノテーションツールのための予約スペース（現時点では何も表示なしでOK）
- 右側のペインに、中央のメイン画面上側でクリックしたアノテーションの情報を表示（DBにおける各カラム情報＋ポリゴンなら面積。ラインなら長さ）

## State Management（Zustand）
### navigationStore
画面遷移時のフィルタ引き継ぎを管理する。

```typescript
interface NavigationState {
  // 画面遷移元からの固定フィルタ
  lockedSceneToken:    string | null  // Scene→Sample/Instance/Sample&Map遷移時
  lockedSampleToken:   string | null  // Sample→Annotation遷移時
  lockedInstanceToken: string | null  // Instance→Annotation遷移時
  lockedCategoryName:  string | null  // Sample→Instance遷移時

  // ロック元画面（ロック解除の判定に使用）
  lockSource: 'scene' | 'sample' | 'instance' | null
}
```

### viewerStore（既存）
- currentMapLocation: string | null
- currentSceneToken:  string | null
- currentSampleToken: string | null
- currentInstanceToken: string | null
- currentAnnotationToken: string | null

## 描画方針
### マップ画像上の点・線描画（Scene/Instance/Annotation画面）
- HTMLCanvas（2D Context）を使用する
- マップ画像をベースレイヤーとしてCanvasに描画し、その上にEgo poseの点を描画する
- ズーム・パン機能が必要な場合はtransformで対応する

### LiDAR点群 + BBox描画（Sample/Instance/Annotation画面）
- バックエンドの GET /api/v1/sensor-data/{token}/pointcloud で
  取得したJSON座標データをCanvasに描画する
- BBoxはEgo座標系に変換してCanvasに2D投影して描画する
- Three.jsやDeck.glは使用しない（Canvasで完結させる）

### カメラ画像 + BBox描画（Sample/Instance/Annotation/Sample&Map画面）
- <img>タグの上にCanvas（position:absolute）を重ねてBBoxを描画する
- カメラ内部パラメータ（camera_intrinsic）を使って3D→2D投影する
- 投影計算は src/lib/coordinateUtils.ts に集約する

### Map Expansion描画（Map/Sample&Map画面）
- Deck.glのGeoJsonLayerを使用する
- センサー画像上へのMap Expansionオーバーレイも
  Deck.glのBitmapLayer（ベース画像）+ GeoJsonLayerで実現する

## Directory Structure
src/
├── types/          # 型定義（バックエンドschemas/と対応）
├── api/            # TanStack Query hooks + apiFetch
├── store/          # Zustand stores
│   ├── viewerStore.ts
│   └── navigationStore.ts
├── layers/         # Deck.glレイヤー定義（Map/Sample&Map画面用）
├── lib/
│   ├── coordinateUtils.ts  # 3D→2D投影・座標変換
│   ├── canvasUtils.ts      # Canvas描画ユーティリティ
│   └── utils.ts            # shadcn/ui用cn関数
└── components/
    ├── ui/         # shadcn/uiコンポーネント（自動生成）
    ├── layout/     # Header, MainLayout, LeftPane, RightPane
    ├── common/     # MapCanvas, BBoxOverlay, EgoPoseMap等の共通描画コンポーネント
    ├── scene/
    ├── sample/
    ├── instance/
    ├── annotation/
    ├── map/
    └── sample-map/

## 実装上の禁止事項
- コンポーネント内に描画ロジック（座標変換・投影計算）を直接書かない
  → coordinateUtils.ts / canvasUtils.ts に集約する
- コンポーネント内から直接fetchを呼ばない
  → api/ のTanStack Queryフックを経由する
- LiDAR/カメラ描画にThree.jsを使わない
  → Canvasで完結させる（Map/Sample&MapのみDeck.gl許可）
- フィルタのロック状態をコンポーネントのlocalStateで管理しない
  → navigationStoreで管理する
