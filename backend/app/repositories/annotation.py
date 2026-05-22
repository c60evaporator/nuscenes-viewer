from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.annotation import Attribute, Category, Instance, SampleAnnotation, Visibility
from app.models.annotation_edit import AnnotationEdit, InstanceEdit
from app.models.scene import Sample
from app.schemas.annotation import AnnotationUpdate
from app.services.annotation_merger import (
    apply_modify, apply_attribute_tokens, apply_visibility,
    synthesize_from_add, merge_annotations, compute_instance_stats,
)
from app.repositories.annotation_edit import AnnotationEditRepository
from app.repositories.exceptions import OptimisticLockError

def _base_query():
    """SampleAnnotation の標準 eager-load オプション付きクエリを返す。"""
    return select(SampleAnnotation).options(
        selectinload(SampleAnnotation.instance).selectinload(Instance.category),
        selectinload(SampleAnnotation.visibility),
        selectinload(SampleAnnotation.attributes),
        selectinload(SampleAnnotation.sample),
    )


class AnnotationRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_all(
        self, limit: int, offset: int
    ) -> tuple[int, list[SampleAnnotation]]:
        """SampleAnnotation 全件をマージ済みで返す.

        単純化のため: 削除済みは結果から除外, add edits は末尾に追加.
        total は (元 - 削除) + add の数.
        ページングは大まかな実装. 厳密な順序整合性は限定的.
        """
        # 全 edits を取得
        edits_result = await self.db.execute(select(AnnotationEdit))
        edits = list(edits_result.scalars().all())

        delete_set = {e.base_token for e in edits if e.edit_type == 'delete' and e.base_token}
        adds_count = sum(1 for e in edits if e.edit_type == 'add')

        # total: 元 - 削除 + 追加
        original_total = (await self.db.execute(
            select(func.count()).select_from(SampleAnnotation)
        )).scalar_one()
        total = original_total - len(delete_set) + adds_count

        # ページングしてベースを取得 (削除は SQL では除外しないでマージ時に対応)
        result = await self.db.execute(
            _base_query()
            .order_by(SampleAnnotation.token)
            .limit(limit)
            .offset(offset)
        )
        base_anns = list(result.scalars().all())

        # マージ
        merged = await merge_annotations(self.db, base_anns, edits)
        return total, merged

    async def get_by_token(self, token: str) -> SampleAnnotation | None:
        """token に対応する SampleAnnotation をマージ済みで返す.

        token が:
          - 既存 SampleAnnotation の場合: base + 関連する modify edit を適用. delete edit があれば None.
          - add edit の token の場合: 合成した SampleAnnotation を返す.
        """
        # まず既存 SampleAnnotation を探す
        result = await self.db.execute(
            _base_query().where(SampleAnnotation.token == token)
        )
        base_ann = result.scalar_one_or_none()
        if base_ann is not None:
            # 関連する edits を取得
            edits_result = await self.db.execute(
                select(AnnotationEdit).where(AnnotationEdit.base_token == token)
            )
            edits = list(edits_result.scalars().all())

            # delete edit があれば None
            if any(e.edit_type == 'delete' for e in edits):
                return None

            # modify edit があれば適用
            modify_edit = next((e for e in edits if e.edit_type == 'modify'), None)
            if modify_edit is not None:
                with self.db.no_autoflush:  # ← no_autoflush で囲む
                    apply_modify(base_ann, modify_edit)
                    await apply_attribute_tokens(self.db, base_ann, modify_edit.attribute_tokens)
                    await apply_visibility(self.db, base_ann, modify_edit.visibility_token)
            return base_ann

        # 既存でなければ add edit を探す
        add_result = await self.db.execute(
            select(AnnotationEdit).where(
                AnnotationEdit.token == token,
                AnnotationEdit.edit_type == 'add',
            )
        )
        add_edit = add_result.scalar_one_or_none()
        if add_edit is None:
            return None
        return await synthesize_from_add(self.db, add_edit)
    
    async def get_raw_by_token(self, token: str) -> SampleAnnotation | None:
        """マージ処理を含めずに, sample_annotations テーブルから直接 token で取得.

        編集機能側 (DELETE / POST) で base となる元データの存在確認に使う.
        get_by_token はマージ済みデータを返すので, この用途には使えない (delete edit があると None になるため).
        """
        result = await self.db.execute(
            select(SampleAnnotation).where(SampleAnnotation.token == token)
        )
        return result.scalar_one_or_none()

    async def get_by_sample(self, sample_token: str) -> list[SampleAnnotation]:
        """sample に紐づく全 annotations をマージ済みで返す."""
        result = await self.db.execute(
            _base_query().where(SampleAnnotation.sample_token == sample_token)
        )
        base_anns = list(result.scalars().all())

        edits_result = await self.db.execute(
            select(AnnotationEdit).where(AnnotationEdit.sample_token == sample_token)
        )
        edits = list(edits_result.scalars().all())

        return await merge_annotations(self.db, base_anns, edits)

    async def get_by_instance(self, instance_token: str) -> list[SampleAnnotation]:
        """instance に紐づく全 annotations をマージ済みで返す (Sample.timestamp 昇順)."""
        result = await self.db.execute(
            _base_query()
            .join(Sample, SampleAnnotation.sample_token == Sample.token)
            .where(SampleAnnotation.instance_token == instance_token)
            .order_by(Sample.timestamp)
        )
        base_anns = list(result.scalars().all())

        edits_result = await self.db.execute(
            select(AnnotationEdit).where(AnnotationEdit.instance_token == instance_token)
        )
        edits = list(edits_result.scalars().all())

        merged = await merge_annotations(self.db, base_anns, edits)
        # マージ後も sample.timestamp 順を維持
        merged.sort(key=lambda a: a.sample.timestamp if a.sample else 0)
        return merged

    async def get_by_instance_and_sample(
        self, instance_token: str, sample_token: str
    ) -> SampleAnnotation | None:
        """特定 Sample での Instance の Annotation を 1 件取得 (マージ済み)."""
        # base
        result = await self.db.execute(
            _base_query().where(
                SampleAnnotation.instance_token == instance_token,
                SampleAnnotation.sample_token == sample_token,
            )
        )
        base_ann = result.scalar_one_or_none()

        # edits
        edits_result = await self.db.execute(
            select(AnnotationEdit).where(
                AnnotationEdit.instance_token == instance_token,
                AnnotationEdit.sample_token == sample_token,
            )
        )
        edits = list(edits_result.scalars().all())

        if base_ann is not None:
            if any(e.edit_type == 'delete' for e in edits):
                return None
            modify_edit = next((e for e in edits if e.edit_type == 'modify'), None)
            if modify_edit is not None:
                with self.db.no_autoflush:  # ← no_autoflush で囲む
                    apply_modify(base_ann, modify_edit)
                    await apply_attribute_tokens(self.db, base_ann, modify_edit.attribute_tokens)
                    await apply_visibility(self.db, base_ann, modify_edit.visibility_token)
            return base_ann

        # base が無ければ add edit を探す
        add_edit = next((e for e in edits if e.edit_type == 'add'), None)
        if add_edit is None:
            return None
        return await synthesize_from_add(self.db, add_edit)

    # ── Instance 系 (動的計算対応) ─────────────────────────────────────────────

    async def get_all_instances(
        self,
        limit: int,
        offset: int,
        scene_token: str | None = None,
        category_name: str | None = None,
    ) -> tuple[int, list[Instance]]:
        """Instance + InstanceEdit を統合し, ページング後の Instance のみ動的計算した stats を含めて返す."""
        # 既存 Instance クエリ
        q = (
            select(Instance)
            .join(Category, Category.token == Instance.category_token)
            .options(selectinload(Instance.category))
            .order_by(Category.name, Instance.token)
        )

        if scene_token is not None:
            scene_inst_subq = (
                select(SampleAnnotation.instance_token)
                .join(Sample, Sample.token == SampleAnnotation.sample_token)
                .where(Sample.scene_token == scene_token)
                .distinct()
            )
            q = q.where(Instance.token.in_(scene_inst_subq))

        if category_name is not None:
            q = q.where(Category.name.ilike(f"%{category_name}%"))

        # 既存 Instance を取得
        existing_result = await self.db.execute(q)
        existing_instances = list(existing_result.scalars().all())

        # InstanceEdit を取得 (フィルタ適用)
        ie_q = select(InstanceEdit)
        ie_result = await self.db.execute(ie_q)
        ie_list = list(ie_result.scalars().all())

        # InstanceEdit → 仮想 Instance に変換
        virtual_instances: list[Instance] = []
        for ie in ie_list:
            cat_result = await self.db.execute(
                select(Category).where(Category.token == ie.category_token)
            )
            category = cat_result.scalar_one_or_none()
            if category is None:
                continue
            if category_name is not None and category_name.lower() not in category.name.lower():
                continue
            if scene_token is not None:
                has_in_scene = await self.db.execute(
                    select(func.count())
                    .select_from(AnnotationEdit)
                    .join(Sample, Sample.token == AnnotationEdit.sample_token)
                    .where(
                        AnnotationEdit.instance_token == ie.token,
                        Sample.scene_token == scene_token,
                    )
                )
                if has_in_scene.scalar_one() == 0:
                    continue
            virtual = Instance(
                token=ie.token,
                category_token=ie.category_token,
                nbr_annotations=0,
                first_annotation_token=None,
                last_annotation_token=None,
            )
            virtual.category = category
            virtual_instances.append(virtual)

        # マージ + ソート
        all_instances = existing_instances + virtual_instances
        all_instances.sort(key=lambda i: (i.category.name if i.category else "", i.token))

        total = len(all_instances)
        # ★ ページング後の Instance だけに対して動的計算を実行
        paged = all_instances[offset:offset + limit]
        for inst in paged:
            nbr, first, last = await compute_instance_stats(self.db, inst.token)
            inst.nbr_annotations = nbr
            inst.first_annotation_token = first
            inst.last_annotation_token = last

        return total, paged

    async def get_instance_by_token(self, token: str) -> Instance | None:
        """1件の Instance または InstanceEdit を動的計算した stats 込みで返す."""
        # 既存 Instance
        result = await self.db.execute(
            select(Instance)
            .options(selectinload(Instance.category))
            .where(Instance.token == token)
        )
        inst = result.scalar_one_or_none()

        if inst is None:
            # InstanceEdit を探す
            ie_result = await self.db.execute(
                select(InstanceEdit).where(InstanceEdit.token == token)
            )
            ie = ie_result.scalar_one_or_none()
            if ie is None:
                return None
            cat_result = await self.db.execute(
                select(Category).where(Category.token == ie.category_token)
            )
            category = cat_result.scalar_one_or_none()
            if category is None:
                return None
            inst = Instance(
                token=ie.token,
                category_token=ie.category_token,
                nbr_annotations=0,
                first_annotation_token=None,
                last_annotation_token=None,
            )
            inst.category = category

        # 動的計算
        nbr, first, last = await compute_instance_stats(self.db, inst.token)
        inst.nbr_annotations = nbr
        inst.first_annotation_token = first
        inst.last_annotation_token = last
        return inst

    async def get_all_categories(self) -> list[Category]:
        result = await self.db.execute(select(Category).order_by(Category.name))
        return list(result.scalars().all())

    async def get_all_visibilities(self) -> list[Visibility]:
        result = await self.db.execute(select(Visibility).order_by(Visibility.token))
        return list(result.scalars().all())

    async def get_all_attributes(self) -> list[Attribute]:
        result = await self.db.execute(select(Attribute).order_by(Attribute.name))
        return list(result.scalars().all())

    async def update(
        self, token: str, data: AnnotationUpdate
    ) -> SampleAnnotation | None:
        """SampleAnnotation を直接更新せず, annotation_edits に modify レコードを作成/更新する.

        楽観的ロック:
            - 既存 modify edit がある場合, data.version との一致を確認
            - 不一致なら OptimisticLockError を投げる
            - 既存 modify edit がない場合 (初回編集), version チェックなし
        """
        # base SampleAnnotation の存在確認 (元データを直接取得, マージなし)
        base_result = await self.db.execute(
            _base_query().where(SampleAnnotation.token == token)
        )
        base_ann = base_result.scalar_one_or_none()
        if base_ann is None:
            return None

        edit_repo = AnnotationEditRepository(self.db)
        edit = await edit_repo.get_modify_by_base(token)

        if edit is None:
            # 初回編集: version チェック免除
            edit = await edit_repo.create_modify(
                base_token=token,
                sample_token=base_ann.sample_token,
                instance_token=base_ann.instance_token,
                translation=data.translation,
                rotation=data.rotation,
                size=data.size,
                visibility_token=data.visibility_token,
                attribute_tokens=data.attribute_tokens,
            )
        else:
            # 既存編集あり: version チェック
            if data.version is None or data.version != edit.version:
                raise OptimisticLockError(
                    current_version=edit.version,
                    expected_version=data.version,
                )
            # 部分上書き + version increment
            if data.translation is not None:
                edit.translation = data.translation
            if data.rotation is not None:
                edit.rotation = data.rotation
            if data.size is not None:
                edit.size = data.size
            if data.visibility_token is not None:
                edit.visibility_token = data.visibility_token
            if data.attribute_tokens is not None:
                edit.attribute_tokens = data.attribute_tokens
            edit.version += 1
            await self.db.flush()

        # マージ結果を返す
        with self.db.no_autoflush:  # ← no_autoflush で囲む
            apply_modify(base_ann, edit)
            await apply_attribute_tokens(self.db, base_ann, edit.attribute_tokens)
            await apply_visibility(self.db, base_ann, edit.visibility_token)
        # base_ann に edit_version を一時的にセットして返す
        base_ann.edit_version = edit.version  # type: ignore[attr-defined]
        return base_ann
