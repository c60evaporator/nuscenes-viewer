"""scene 削除（DELETE /scenes/{token}）のサービス層.

選択した scene を、依存する samples / sample_data / sample_annotations /
annotation_edits（CASCADE）と、孤児になった ego_poses / calibrated_sensors /
logs / instance_edits（明示削除）も含めて 1 トランザクションで削除する。

- コミットは末尾の 1 回のみ。途中の例外では何もコミットされない（全ロールバック）
- 孤児削除は「他から参照されておらず is_user_created=true」のレコードのみ対象
  （初回インポートデータは false のため誤削除されない。共有されている
   calibrated_sensor / log は参照が残るため保護される）
"""
import logging

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.scene_delete import SceneDeleteRepository
from app.schemas.scene_delete import SceneDeleteResult

logger = logging.getLogger(__name__)


async def delete_scene(db: AsyncSession, token: str) -> SceneDeleteResult:
    repo = SceneDeleteRepository(db)

    # ── 1. 存在確認・権限確認 ────────────────────────────────────────────────
    scene = await repo.get_scene(token)
    if scene is None:
        raise HTTPException(status_code=404, detail="Scene not found")
    if not scene.is_user_created:
        raise HTTPException(status_code=403, detail="Only user-added scenes can be deleted")

    scene_name = scene.name
    log_token  = scene.log_token

    # ── 2. 削除前に CASCADE 対象の件数と孤児候補 token を収集 ────────────────
    counts = await repo.count_children(token)
    ep_tokens, cs_tokens = await repo.get_referenced_tokens(token)

    # ── 3. 削除（scenes → CASCADE → 孤児の明示削除）────────────────────────
    try:
        counts["scenes"]            = await repo.delete_scene(token)
        # sample_data 消滅後なので RESTRICT FK に抵触しない
        counts["ego_pose"]          = await repo.delete_orphan_ego_poses(ep_tokens)
        counts["calibrated_sensor"] = await repo.delete_orphan_calibrated_sensors(cs_tokens)
        counts["log"]               = await repo.delete_orphan_logs([log_token])
        counts["instance_edits"]    = await repo.delete_orphan_instance_edits()
        await db.commit()
    except Exception:
        await db.rollback()
        logger.exception("scene delete failed (rolled back): %s", token)
        raise

    logger.info("scene delete: %s (%s) %s", token, scene_name, counts)
    return SceneDeleteResult(
        deleted_scene_token=token,
        deleted_scene_name=scene_name,
        deleted_counts=counts,
    )
