"""nuScenes 形式 JSON エクスポートサービス.

マージ済みアノテーションを含む 13 ファイル分のレコードを組み立て,
整合性チェック結果を警告メッセージとして返す.
"""
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.nuscenes_export_builders import (
    build_attribute_records,
    build_calibrated_sensor_records,
    build_category_records,
    build_ego_pose_records,
    build_instance_records,
    build_log_records,
    build_map_records,
    build_sample_annotation_records,
    build_sample_data_records,
    build_sample_records,
    build_scene_records,
    build_sensor_records,
    build_visibility_records,
)


class NuScenesExportService:
    """nuScenes 形式エクスポートサービス.

    scene_token が None の場合は全シーン分を出力する.
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def build_all_records(
        self, scene_token: str | None
    ) -> dict[str, list[dict]]:
        """全 13 ファイルの内容を組み立てて辞書で返す."""
        return {
            'sample_annotation.json': await build_sample_annotation_records(self.db, scene_token),
            'instance.json':          await build_instance_records(self.db, scene_token),
            'category.json':          await build_category_records(self.db),
            'attribute.json':         await build_attribute_records(self.db),
            'visibility.json':        await build_visibility_records(self.db),
            'sample.json':            await build_sample_records(self.db, scene_token),
            'scene.json':             await build_scene_records(self.db, scene_token),
            'sample_data.json':       await build_sample_data_records(self.db, scene_token),
            'calibrated_sensor.json': await build_calibrated_sensor_records(self.db, scene_token),
            'ego_pose.json':          await build_ego_pose_records(self.db, scene_token),
            'log.json':               await build_log_records(self.db, scene_token),
            'map.json':               await build_map_records(self.db, scene_token),
            'sensor.json':            await build_sensor_records(self.db),
        }

    def validate_consistency(
        self, records: dict[str, list[dict]]
    ) -> list[str]:
        """整合性チェック. 警告メッセージのリストを返す.

        チェック項目:
          1. prev/next の参照先が出力対象に存在するか
          2. 双方向 chain の整合性 (A.next=B なら B.prev=A)
          3. annotation の instance_token の参照先が存在するか
          (孤立 instance は build_instance_records で既に除外済み)
        """
        annotations = records['sample_annotation.json']
        instances   = records['instance.json']

        warnings: list[str] = []
        ann_tokens      = {a['token'] for a in annotations}
        instance_tokens = {i['token'] for i in instances}
        ann_by_token    = {a['token']: a for a in annotations}

        for ann in annotations:
            prev_tok = ann['prev']
            next_tok = ann['next']

            if prev_tok and prev_tok not in ann_tokens:
                warnings.append(
                    f"Annotation {ann['token']}: prev='{prev_tok}' refers to non-existent annotation"
                )
            if next_tok and next_tok not in ann_tokens:
                warnings.append(
                    f"Annotation {ann['token']}: next='{next_tok}' refers to non-existent annotation"
                )
            if next_tok and next_tok in ann_by_token:
                next_ann = ann_by_token[next_tok]
                if next_ann['prev'] != ann['token']:
                    warnings.append(
                        f"Chain inconsistency: {ann['token']}.next='{next_tok}' "
                        f"but {next_tok}.prev='{next_ann['prev']}'"
                    )
            if ann['instance_token'] not in instance_tokens:
                warnings.append(
                    f"Annotation {ann['token']}: instance_token='{ann['instance_token']}' not in export"
                )

        return warnings
