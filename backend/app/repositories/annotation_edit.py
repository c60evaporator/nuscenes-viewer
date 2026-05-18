"""Repository for AnnotationEdit and InstanceEdit tables."""
import secrets

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation_edit import AnnotationEdit, InstanceEdit


def generate_token() -> str:
    """nuScenes 互換の 32 文字 hex token を生成."""
    return secrets.token_hex(16)


class AnnotationEditRepository:
    """AnnotationEdit テーブルへの CRUD."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_token(self, token: str) -> AnnotationEdit | None:
        """edit 自身の token で取得."""
        result = await self.db.execute(
            select(AnnotationEdit).where(AnnotationEdit.token == token)
        )
        return result.scalar_one_or_none()

    async def get_modify_by_base(self, base_token: str) -> AnnotationEdit | None:
        """base_token の最新 modify edit を取得."""
        result = await self.db.execute(
            select(AnnotationEdit).where(
                AnnotationEdit.base_token == base_token,
                AnnotationEdit.edit_type == 'modify',
            )
        )
        return result.scalar_one_or_none()
    
    async def get_add_by_token(self, token: str) -> AnnotationEdit | None:
        """add edit を自身の token で取得."""
        result = await self.db.execute(
            select(AnnotationEdit).where(
                AnnotationEdit.token == token,
                AnnotationEdit.edit_type == 'add',
            )
        )
        return result.scalar_one_or_none()

    async def get_by_sample(self, sample_token: str) -> list[AnnotationEdit]:
        """sample_token の全 edits を取得 (modify/add/delete すべて)."""
        result = await self.db.execute(
            select(AnnotationEdit).where(AnnotationEdit.sample_token == sample_token)
        )
        return list(result.scalars().all())

    async def get_by_instance(self, instance_token: str) -> list[AnnotationEdit]:
        """instance_token の全 edits を取得."""
        result = await self.db.execute(
            select(AnnotationEdit).where(AnnotationEdit.instance_token == instance_token)
        )
        return list(result.scalars().all())

    async def get_delete_by_base(self, base_token: str) -> AnnotationEdit | None:
        """base_token の delete edit を取得."""
        result = await self.db.execute(
            select(AnnotationEdit).where(
                AnnotationEdit.base_token == base_token,
                AnnotationEdit.edit_type == 'delete',
            )
        )
        return result.scalar_one_or_none()

    async def create_modify(
        self,
        base_token: str,
        sample_token: str,
        instance_token: str,
        translation: list[float] | None = None,
        rotation: list[float] | None = None,
        size: list[float] | None = None,
        visibility_token: str | None = None,
        attribute_tokens: list[str] | None = None,
        prev: str | None = None,
        next_: str | None = None,
    ) -> AnnotationEdit:
        """新規 modify edit を作成."""
        edit = AnnotationEdit(
            token=generate_token(),
            base_token=base_token,
            edit_type='modify',
            sample_token=sample_token,
            instance_token=instance_token,
            translation=translation,
            rotation=rotation,
            size=size,
            prev=prev,
            next=next_,
            visibility_token=visibility_token,
            attribute_tokens=attribute_tokens,
            version=1,
        )
        self.db.add(edit)
        await self.db.flush()
        return edit

    async def create_add(
        self,
        sample_token: str,
        instance_token: str,
        translation: list[float],
        rotation: list[float],
        size: list[float],
        prev: str | None = None,
        next_: str | None = None,
        visibility_token: str | None = None,
        attribute_tokens: list[str] | None = None,
        token: str | None = None,
    ) -> AnnotationEdit:
        """新規 add edit を作成."""
        edit = AnnotationEdit(
            token=token or generate_token(),
            base_token=None,
            edit_type='add',
            sample_token=sample_token,
            instance_token=instance_token,
            translation=translation,
            rotation=rotation,
            size=size,
            prev=prev,
            next=next_,
            visibility_token=visibility_token,
            attribute_tokens=attribute_tokens or [],
            version=1,
        )
        self.db.add(edit)
        await self.db.flush()
        return edit

    async def create_delete(
        self,
        base_token: str,
        sample_token: str,
        instance_token: str,
    ) -> AnnotationEdit:
        """新規 delete edit を作成."""
        edit = AnnotationEdit(
            token=generate_token(),
            base_token=base_token,
            edit_type='delete',
            sample_token=sample_token,
            instance_token=instance_token,
            version=1,
        )
        self.db.add(edit)
        await self.db.flush()
        return edit
    
    async def delete_edit(self, edit: AnnotationEdit) -> None:
        """edit レコードを物理削除 (= add edit 自体を消す場合に使用)."""
        await self.db.delete(edit)
        await self.db.flush()

    async def update_chain(
        self,
        edit: AnnotationEdit,
        field: str,
        new_value: str,
    ) -> None:
        """既存 edit の prev / next を直接書き換え, version をインクリメント.

        field は 'prev' または 'next'. それ以外は ValueError.
        """
        if field not in ('prev', 'next'):
            raise ValueError(f"field must be 'prev' or 'next', got '{field}'")
        setattr(edit, field, new_value)
        edit.version += 1
        await self.db.flush()


class InstanceEditRepository:
    """InstanceEdit テーブルへの CRUD."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_token(self, token: str) -> InstanceEdit | None:
        result = await self.db.execute(
            select(InstanceEdit).where(InstanceEdit.token == token)
        )
        return result.scalar_one_or_none()

    async def create(self, category_token: str, token: str | None = None) -> InstanceEdit:
        """新規 InstanceEdit を作成."""
        edit = InstanceEdit(
            token=token or generate_token(),
            category_token=category_token,
            version=1,
        )
        self.db.add(edit)
        await self.db.flush()
        return edit
