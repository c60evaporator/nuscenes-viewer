## API Reference
<!-- エンドポイント表 -->

## DBテーブル

### instances

### instance_edits

###

### annotation_edits

また、あるinstanceに関してannotation_editsテーブルで全てのアノテーションがedit_type=deleteとなった場合、インスタンス内のアノテーションが0個の孤立instanceとなる。この孤立instanceは以下のように扱う。

#### 孤立 instance の扱い

全 annotation を delete された instance (= 「孤立 instance」) は、
instances / instance_edits テーブルから物理削除されない。

理由:
1. 元 nuScenes データを破壊しない原則
2. 編集の可逆性 (将来サーバー側 Undo を実装する場合)
3. 監査トレイル (annotation_edits に履歴が残る)
4. 孤立instanceは手動で編集された結果生じるため、通常運用ではパフォーマンスに影響が出る規模に達する事はない。将来クリーンアップが必要になれば, 管理コマンドとして追加実装する（/api/v1/instancesエンドポイントのレスポンスでnbr_annotations=0でフィルタリングすれば簡単に検出できるため）。

また、孤立 instance は以下処理により、フロントエンドやJSONエクスポートでは結果から除外され、ユーザーからは見えることがない:
- /api/v1/instances?scene_token=... (scene フィルタあり)
- JSONエクスポート (build_instance_records)

## JSON output

DB内のデータに基づき、

- `export/`

出力されるのは以下のファイル

- 

以下の2つのjsonファイルのみ、初回インポートデータを保持するテーブルと追加・削除・編集したデータを保持するテーブルが分かれているため、

#### instance.json

- 初回インポート時から含まれていたinstance（instanceテーブル）と追加・削除・編集されたinstance（instance_editsテーブル）を結合してエクスポート
- nbr_annotations、first_annotation_token、last_annotation_tokenはエクスポート時に動的計算
- annotationが含まれないinstance（孤立instance）はエクスポート対象から除外

#### sample_annotation.json

- 初回インポート時から含まれていたannotation（annotationテーブル）と追加・削除・編集されたannotation（annotation_editsテーブル）を結合してエクスポート
- annotation_editsテーブルのbase_tokenをannotationテーブルのtokenと紐付ける
- annotation_editsテーブルでedit_type=deleteのレコードは、annotationテーブルに含まれていてもエクスポートから除外
- annotation_editsテーブルでedit_type=modifyのレコードは、nullでないフィールドを上書きし、nullのフィールドは紐づいたannotationテーブルの値をそのまま使用。またprev_cleared、next_clearedがTrueの場合、それぞれエクスポートの"prev"および"next"のフィールドを空文字にする
- annotation_editsテーブルでedit_type=addのレコードは、そのままエクスポートする

## Test

All tests

```bash
docker compose exec api pytest /app/tests/ -v
```

test by each file

```bash
docker compose exec api pytest /app/tests/unit/test_annotation_merger.py -v
```

Linter check

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
pip install ruff
cd backend
ruff check .
```
