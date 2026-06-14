from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.converters.annotation import AnnotationConverter
from app.dependencies import get_db
from app.repositories.annotation import AnnotationRepository
from app.repositories.annotation_edit import AnnotationEditRepository, InstanceEditRepository
from app.repositories.exceptions import OptimisticLockError
from app.schemas.annotation import AnnotationResponse, AnnotationUpdate, AnnotationCreate
from app.schemas.common import PaginatedResponse
from app.services.annotation_edit_service import create_chain_modify

router = APIRouter(prefix="/annotations", tags=["annotations"])


@router.get("", response_model=PaginatedResponse[AnnotationResponse])
async def list_annotations(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    repo = AnnotationRepository(db)
    total, annotations = await repo.get_all(limit, offset)
    return PaginatedResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[AnnotationConverter.to_response(a) for a in annotations],
    )


@router.get("/{token}", response_model=AnnotationResponse)
async def get_annotation(token: str, db: AsyncSession = Depends(get_db)):
    ann = await AnnotationRepository(db).get_by_token(token)
    if not ann:
        raise HTTPException(status_code=404, detail="Annotation not found")
    return AnnotationConverter.to_response(ann)


@router.patch("/{token}", response_model=AnnotationResponse)
async def update_annotation(
    token: str,
    data: AnnotationUpdate,
    db: AsyncSession = Depends(get_db),
):
    try:
        ann = await AnnotationRepository(db).update(token, data)
    except OptimisticLockError as e:
        raise HTTPException(
            status_code=409,
            detail={
                "message":          "Optimistic lock conflict",
                "current_version":  e.current_version,
                "expected_version": e.expected_version,
            },
        )
    if not ann:
        raise HTTPException(status_code=404, detail="Annotation not found")
    await db.commit()
    return AnnotationConverter.to_response(ann)

@router.post("", response_model=AnnotationResponse, status_code=status.HTTP_201_CREATED)
async def create_annotation(
    data: AnnotationCreate,
    db: AsyncSession = Depends(get_db),
):
    """新規 BBox を追加. (...省略...)"""
    if (data.instance_token is None) == (data.new_instance is None):
        raise HTTPException(
            status_code=400,
            detail="Exactly one of 'instance_token' or 'new_instance' must be provided",
        )

    edit_repo          = AnnotationEditRepository(db)
    instance_edit_repo = InstanceEditRepository(db)

    # 1. instance を準備
    if data.new_instance is not None:
        # new instanceかつcategory_token未指定はエラー
        if not data.new_instance.category_token:
            raise HTTPException(
                status_code=400,
                detail="category_token is required when creating a new instance",
            )
        # new instance の場合: instance_edit を作成して instance_token を取得
        new_instance_edit = await instance_edit_repo.create(
            category_token=data.new_instance.category_token,
        )
        instance_token = new_instance_edit.token
    else:
        instance_token = data.instance_token

    # 2. add edit を作成
    add_edit = await edit_repo.create_add(
        sample_token=data.sample_token,
        instance_token=instance_token,
        translation=data.translation,
        rotation=data.rotation,
        size=data.size,
        prev=data.prev,
        next_=data.next,
        visibility_token=data.visibility_token,
        attribute_tokens=data.attribute_tokens,
    )

    # 3. 隣接 chain の書き換え
    if data.prev is not None:
        await create_chain_modify(db, target_token=data.prev, field='next', new_value=add_edit.token)
    if data.next is not None:
        await create_chain_modify(db, target_token=data.next, field='prev', new_value=add_edit.token)

    await db.commit()

    # マージ済み結果を返す
    repo = AnnotationRepository(db)
    merged = await repo.get_by_token(add_edit.token)
    if merged is None:
        raise HTTPException(status_code=500, detail="Failed to synthesize new annotation")
    return AnnotationConverter.to_response(merged)


@router.delete("/{token}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_annotation(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """BBox を論理削除 (or add edit の物理削除).

    削除対象の prev/next を読み取り, それぞれの隣接 annotation の
    next/prev も更新して chain の整合性を保つ.

    > annotationが0になった孤立instanceは削除しない（Undoしたくなったときのため残す）
    > 孤立instanceはDB上に残り続けることに注意が必要だが、GETエンドポイントのレスポンスやJSON出力から除外する等で対応済
    """
    ann_repo  = AnnotationRepository(db)
    edit_repo = AnnotationEditRepository(db)

    # 既存 SampleAnnotation の場合: delete edit を作成 + 隣接 chain 書き換え
    base = await ann_repo.get_raw_by_token(token)
    if base is not None:
        existing_delete = await edit_repo.get_delete_by_base(token)
        if existing_delete is not None:
            # 既に delete edit がある: 冪等で何もしない
            await db.commit()
            return

        # マージ済みデータから最新の prev/next を取得
        merged = await ann_repo.get_by_token(token)
        if merged is None:
            # 通常あり得ない (base が存在するのに merged が None)
            await db.commit()
            return
        prev_token = merged.prev
        next_token = merged.next

        # delete edit を作成
        await edit_repo.create_delete(
            base_token=token,
            sample_token=base.sample_token,
            instance_token=base.instance_token,
        )

        # 隣接 chain の書き換え
        if prev_token is not None:
            # prev 側の next を, 削除対象の next (削除後の連結先) に書き換え
            await create_chain_modify(
                db, target_token=prev_token, field='next', new_value=next_token
            )
        if next_token is not None:
            # next 側の prev を, 削除対象の prev (削除後の連結先) に書き換え
            await create_chain_modify(
                db, target_token=next_token, field='prev', new_value=prev_token
            )

        await db.commit()
        return

    # AnnotationEdit (add) の場合: そのレコード自体を物理削除
    add_edit = await edit_repo.get_add_by_token(token)
    if add_edit is not None:
        prev_token = add_edit.prev
        next_token = add_edit.next

        await edit_repo.delete_edit(add_edit)

        # 隣接 chain の書き換え
        if prev_token is not None:
            await create_chain_modify(
                db, target_token=prev_token, field='next', new_value=next_token
            )
        if next_token is not None:
            await create_chain_modify(
                db, target_token=next_token, field='prev', new_value=prev_token
            )

        await db.commit()
        return

    raise HTTPException(status_code=404, detail="Annotation not found")
