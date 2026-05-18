"""AnnotationEdit に関する複合的なビジネスロジック.

POST/DELETE エンドポイントから呼ばれる, 複数 Repository をまたぐ操作を含む.
"""
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.annotation import AnnotationRepository
from app.repositories.annotation_edit import AnnotationEditRepository


async def create_chain_modify(
    db: AsyncSession,
    target_token: str,
    field: str,
    new_value: str,
) -> None:
    """隣接アノテーション (target_token) の prev / next を new_value に書き換える.

    target_token が指す対象により処理が分岐:
      - 既存 SampleAnnotation の場合:
          既存 modify edit があれば更新, なければ新規 modify edit を作成
      - AnnotationEdit (add) の場合:
          add edit の prev / next を直接書き換え

    field は 'prev' または 'next'.
    """
    if field not in ('prev', 'next'):
        raise ValueError(f"field must be 'prev' or 'next', got '{field}'")

    ann_repo  = AnnotationRepository(db)
    edit_repo = AnnotationEditRepository(db)

    # 既存 SampleAnnotation かチェック
    base = await ann_repo.get_raw_by_token(target_token)
    if base is not None:
        existing_modify = await edit_repo.get_modify_by_base(target_token)
        if existing_modify is None:
            # 新規 modify edit
            kwargs = {
                'base_token':     target_token,
                'sample_token':   base.sample_token,
                'instance_token': base.instance_token,
                'prev': new_value if field == 'prev' else None,
                'next_': new_value if field == 'next' else None,
            }
            await edit_repo.create_modify(**kwargs)
        else:
            # 既存 modify edit の prev / next のみ更新
            await edit_repo.update_chain(existing_modify, field, new_value)
        return

    # add edit を探して直接更新
    add_edit = await edit_repo.get_add_by_token(target_token)
    if add_edit is not None:
        await edit_repo.update_chain(add_edit, field, new_value)
        return

    raise HTTPException(
        status_code=400,
        detail=f"Adjacent annotation '{target_token}' not found",
    )
