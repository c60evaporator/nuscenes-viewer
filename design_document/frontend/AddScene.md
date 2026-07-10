# scene追加機能

## 基本方針

- scenesテーブル、およびsamples/sample_data/ego_pose/log/calibrated_sensorテーブルをcreate対象とする
    - deleteではannotation_edits, instance_editsテーブルも対象に加わる
- scene単位で追加・削除を行う（samples/sample_data/ego_pose/log/calibrated_sensorの単体での追加・削除は想定しない）
    - ただし、ego_pose/calibrated_sensorはPut
- 編集（patch）は不要（データ収集時に内容が確定しているため）
- 初回インポートでDBに読み込んだsceneは削除できないようにする（初期のデータセットを保持するという原則に従うため）。これを表す`is_user_created`列をscenesテーブルに追加し、初回インポートで読み込んだレコードはfalse、本scene追加機能で追加したレコードはtrueを入れる

### スキーマの修正

- scenes / ego_poses / calibrated_sensors / logs / samples / sample_dataテーブルに`is_user_created`列を追加（削除判定に使用。samples / sample_dataテーブルはCASCADE自動削除されるため削除判定にこの列は使用しないが、ユーザ追加したレコードかを区別するために念の為追加しておく）

### Create

scene.json/sample.json/sample_data.json/ego_pose.json/log.json/calibrated_sensor.jsonをフロントエンド側でユーザーから受け取り、バックエンドに送ってDBに登録する処理

#### フロントエンド

- Scene画面の左ペイン「Add Scene」を押すと、scene追加用のモーダルダイアログが開く
- モーダルダイアログには、以下のUIが含まれる
    - フォルダ選択用UI (webkitdirectory)
    - 「Import」ボタン（最初は無効化）
    - 「Cancel」ボタン
- フォルダ選択用UIでフォルダを選択した瞬間、以下バリデーションを実施し（sample_dataとego_poseは処理が重いのでフロントエンドでバリデーションせずバックエンド側でバリデーション。バリデーション実施中はフリーズしているように見えないようどのファイルを処理しているか表示）、下のように結果を表示  
    - 期待する6ファイルが揃っているか
    - JSONパースができるか
    - 全てlogのlocationが現状のmap_metaテーブルレコードのlocationに存在するか
    - 全てのsampleのscene_tokenがscenes.jsonのtokenに存在するか
    - 全てのcalibrated_sensorのsensor_tokenがsensorsテーブルレコードのtokenに存在するか

```
✅ scenes.json           (12 records)
✅ samples.json          (480 records)
✅ sample_data.json      (23,040 records)
✅ ego_pose.json         (23,040 records)
✅ log.json              (2 records)
❌ calibrated_sensor.json  — 見つかりません
```

- 上記バリデーショーンが通ったら、「Import」ボタンを有効化
- 「Import」ボタンを押すと、"Add the scenes? This action cannot be undone."的な確認ダイアログを出して、OKを押したら以下処理を進める。Cancelを押したら元に戻る
    - 6つのjsonを`multipart/form-data`形式で`POST /api/v1/scenes/import`リクエストでバックエンドに送る。本エンドポイントの詳細は後述するが、以下の条件を満たすリクエストを送る
        - 常に`dry_run=False`（`dry_run=True`のバリデーションのみモードは現時点では使用しない）
    - バックエンド側から422が帰ってきたら、一緒に受け取った失敗理由を適切にモーダルに表示する
    - 成功レスポンスが帰ってきたらモーダルに以下のような成功サマリを表示。「Close」ボタンを押したらモーダルを閉じる
    - 「Close」ボタンを押してモーダルが閉じたら、背後のScene一覧リストが更新される。このとき、新しく追加されたSceneが緑表示で左ペインに現れている状態に、リストをスクロールした状態にしておく（Importの結果がわかりやすいUIにするため）

```
✅ インポート完了
追加されたScene: 12件
  scene-0646 〜 scene-0657

内訳:
  scenes              12
  samples            480
  sample_data     23,040
  ego_pose        23,040
  log                  2
  calibrated_sensor    6
```

#### バックエンド

- エンドポイント`POST /api/v1/scenes/import`を作成。
- エンドポイント構造は以下を想定。フロントエンドで取得した6つのjsonファイルを`multipart/form-data`形式で受け取る

```python
@router.post("/scenes/import", response_model=SceneImportResult)
async def import_scenes(
    scenes_file: UploadFile = File(...),
    samples_file: UploadFile = File(...),
    sample_data_file: UploadFile = File(...),
    ego_pose_file: UploadFile = File(...),
    log_file: UploadFile = File(...),
    calibrated_sensor_file: UploadFile = File(...),
    dry_run: bool = Form(False),
    session: AsyncSession = Depends(get_session),
):
    ...
```

- 大原則として、6ファイルを1リクエスト・1トランザクションで投入する設計にする（scenes/samples/sample_data/ego_pose/log/calibrated_sensorは相互にFKで依存しているため、途中で失敗したときに一部だけ入ることを避ける）
- `dry_run`パラメータがTrueのときは、バリデーションのみ実施（以下サービス層手順の3を実施せず、それ以外のバリデーションおよびレスポンスを返す処理を実施）
- リクエストを受け取ったら、以下手順でサービス層の処理を実行
    - 1. 各JSONをPydanticでパース。必要に応じて`backend/app/schemas`内にパース用スキーマを追加
    - 2. 以下バリデーションを実行。バリデーションが失敗したら422とともに「どのファイルのどのtokenが問題か」を構造化して返し、モーダルに表示させる。
        - 全てlogのlocationがmap_metaテーブルレコードのlocationに存在するか
        - 全てのsampleのscene_tokenがscenesテーブルレコードのtokenに存在するか
        - 全てのsample_dataのsample_tokenがsamplesテーブルレコードのtokenに存在するか。ego_pose_tokenがego_poseテーブルレコードのtokenに存在するか。calibrated_sensor_tokenがcalibrated_sensorテーブルレコードのtokenに存在するか
        - 全てのcalibrated_sensorのsensor_tokenがsensorsテーブルレコードのtokenに存在するか
    - 3. 投入順序を守ってINSERT（1トランザクション）：以下のルールを守ってデータをDBにINSERTする
        - logs → calibrated_sensors → ego_poses → scenes → samples → sample_dataの順番（親から子の順）で投入
        - calibrated_sensor, logはすでに登録されているレコードと今回のリクエストが重複する可能性があるため、tokenが重複していないもののみ追加する
        - 全INSERTを1つの`async with session.begin():`に包み、途中で例外が出たら全ロールバック
        - `is_user_created`列は常にtrueとする（初期INSERTではなくユーザ追加したデータであることを表す）
    - 4. 投入したレコード数を集計して以下形式のレスポンスを返す。

```python
class SceneImportResult(BaseModel):
    dry_run: bool
    ok: bool
    imported_counts: dict[str, int]   # {"scenes": 12, "samples": 480, ...}
    added_scene_names: list[str]      # ["scene-0646", ...] モーダルのサマリ表示用
    errors: list[ImportError] = []    # 整合性エラーの構造化リスト
```

レスポンスは以下のようにする

- パースやバリデーションに失敗した場合、失敗内容をerrorsに記述
- `imported_counts`に各テーブルに投入したレコード数を格納（`dry_run=True`のときは`imported_counts`を「投入予定件数」として返し、`errors`が空なら投入ボタンを活性化、という使い方を想定。ただし現時点ではフロントエンド側に本ロジックの実装は不要）

#### その他

- 本機能で追加した`is_user_created`列がtrueのsceneは、左ペインのリスト表示で色を変える。左端アクセントバー緑#16a34a＋淡い緑背景#f0fdf4とする。マウス選択と重なったときは選択のブルーを優先しつつ左端アクセントバー緑を残す

### Delete

選択したsceneを、依存するsamples / sample_datas / sample_annotations / annotation_edits / ego_poses / calibrated_sensors / logs / instance_editsも含めてDBから削除する処理

#### フロントエンド

- Scene画面の左ペイン下方に「Delete Scene」ボタンを設置。左ペインのリストで`is_user_created=true`のSceneを選択しているときのみ有効化
- 左ペインのリストで`is_user_created=false`のSceneを選択しているときは、「Delete Scene」ボタンの上にマウスカーソルを合わせると"Only user-added scenes can be deleted"と書いたツールチップを表示
- ボタンを押すと、"Delete "scene-0646"? This action cannot be undone."というような確認ダイアログを出して、OKを押したら`DELETE /api/v1/scenes/{token}`リクエストがバックエンドに送られる。Cancelを押したら元に戻る
- 失敗レスポンスが帰ってきたら、失敗レスポンス番号に応じて適切な理由をダイアログ表示
- 成功レスポンスが帰ってきたら、"scene-0646 and its related records are deleted"のようにダイアログ表示

#### バックエンド

- エンドポイント`DELETE /api/v1/scenes/{token}`を作成
- 大原則として、全てのテーブルの削除処理を1トランザクションで実行する設計にする（各テーブルは相互にFKで依存しているため、途中で失敗したときに一部だけ削除されることを避ける）
- リクエストを受け取ったら、以下手順でサービス層の処理を実行
    - 1. リクエスト中のscene_tokenがscenesテーブルに存在するかを確認。存在しなければ 404を返す。また当該sceneの`is_user_created=True`かをサーバー側でも再確認し、`is_user_created=false`なら403 Forbiddenで拒否レスポンス
    - 2. （以降のStep2, Step3はまとめて`async with session.begin():`に包み、途中失敗なら全ロールバック）scenesテーブルの当該tokenのレコードを削除。CASCADE経路で紐づいたsamples, sample_data, sample_annotation, およびannotation_editsが全て削除される。ただし一部テーブルのレコードははこの時点では削除されないので、Step3で明示削除
    - 3. Step2で削除されなかった以下のテーブルのレコードを削除
        - ego_pose: 残った他sample_dataから参照されておらず、かつis_user_createdがfalseのレコードを削除
        - calibrated_sensor: 残った他sample_dataから参照されておらず、かつis_user_createdがfalseのレコードを削除
        - logs: 残った他sceneから参照されておらず、かつis_user_createdがfalseのレコードを削除
        - instance_edits: 残ったannotation_editsから参照されていないレコードを削除（）
    - 4. 削除したレコード数を集計して以下形式のレスポンスを返す。

```python
class SceneDeleteResult(BaseModel):
    deleted_scene_token: str
    deleted_scene_name: str
    deleted_counts: dict[str, int]  # {"scenes": 1, "samples": 40, "sample_data": 2304, ...}
```
