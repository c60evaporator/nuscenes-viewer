"""SampleAnnotation と AnnotationEdit のマージロジック.

責務:
  - 'modify' edit を base SampleAnnotation に適用 (apply_modify)
  - 'add' edit から SampleAnnotation を合成 (synthesize_from_add)
  - 'delete' edit を考慮して結果から除外 (merge_annotations)
  - Instance + InstanceEdit のマージと nbr_annotations / first/last_annotation_token の動的計算
"""
from typing import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.annotation import Attribute, Instance, SampleAnnotation, Visibility
from app.models.annotation_edit import AnnotationEdit, InstanceEdit
from app.models.scene import Sample


# ── 単体マージ ─────────────────────────────────────────────────────────────────

def apply_modify(base: SampleAnnotation, edit: AnnotationEdit) -> SampleAnnotation:
    """base SampleAnnotation に modify edit の非 NULL 値を適用したオブジェクトを返す.

    base の属性を直接書き換える (DB へは flush しない前提).
    base を返すことで, 元の eager-load された関連オブジェクト (instance, visibility, attributes) を維持する.

    edit のカラムが NULL の場合は base の値を維持する (上書きしない).
    attribute_tokens の上書きは, 呼び出し側で attributes リレーションへの反映が必要.
    """
    if edit.translation is not None:
        base.translation = edit.translation
    if edit.rotation is not None:
        base.rotation = edit.rotation
    if edit.size is not None:
        base.size = edit.size
    if edit.prev is not None:
        base.prev = edit.prev
    if edit.next is not None:
        base.next = edit.next
    if edit.visibility_token is not None:
        base.visibility_token = edit.visibility_token
    # attributes と visibility リレーションは別途反映する (apply_attribute_tokens / apply_visibility)
    return base


async def apply_attribute_tokens(
    db: AsyncSession,
    ann: SampleAnnotation,
    attribute_tokens: list[str] | None,
) -> None:
    """ann.attributes リレーションを attribute_tokens のリストに置き換える.

    attribute_tokens が None の場合は何もしない (= 既存の attributes を維持).
    """
    if attribute_tokens is None:
        return
    result = await db.execute(
        select(Attribute).where(Attribute.token.in_(attribute_tokens))
    )
    ann.attributes = list(result.scalars().all())


async def apply_visibility(
    db: AsyncSession,
    ann: SampleAnnotation,
    visibility_token: str | None,
) -> None:
    """ann.visibility リレーションを visibility_token に応じて置き換える.

    visibility_token が None の場合は何もしない (= 既存の visibility を維持).
    """
    if visibility_token is None:
        return
    result = await db.execute(
        select(Visibility).where(Visibility.token == visibility_token)
    )
    ann.visibility = result.scalar_one_or_none()


async def synthesize_from_add(
    db: AsyncSession,
    edit: AnnotationEdit,
) -> SampleAnnotation | None:
    """add edit から SampleAnnotation インスタンスを合成する.

    DB の sample_annotations には INSERT しない (transient なオブジェクト).
    関連リレーション (instance, visibility, attributes) は edit のフィールドから組み立てる.

    Returns: None if 必須フィールドが欠けている場合 (= 不正な add edit)
    """
    if edit.edit_type != 'add':
        raise ValueError(f"Expected edit_type='add', got '{edit.edit_type}'")
    if edit.sample_token is None or edit.instance_token is None:
        return None
    if edit.translation is None or edit.rotation is None or edit.size is None:
        return None

    ann = SampleAnnotation(
        token=edit.token,
        sample_token=edit.sample_token,
        instance_token=edit.instance_token,
        translation=edit.translation,
        rotation=edit.rotation,
        size=edit.size,
        prev=edit.prev,
        next=edit.next,
        num_lidar_pts=0,
        num_radar_pts=0,
        visibility_token=edit.visibility_token,
    )

    # ── instance リレーションを設定 ──
    # 既存 Instance または InstanceEdit のいずれかから category を取得
    instance_result = await db.execute(
        select(Instance)
        .options(selectinload(Instance.category))
        .where(Instance.token == edit.instance_token)
    )
    instance = instance_result.scalar_one_or_none()
    if instance is None:
        # InstanceEdit から取得
        ie_result = await db.execute(
            select(InstanceEdit).where(InstanceEdit.token == edit.instance_token)
        )
        ie = ie_result.scalar_one_or_none()
        if ie is None:
            return None  # 不正な instance_token
        # InstanceEdit から仮想 Instance を作る (category リレーションも引っ張る)
        from app.models.annotation import Category
        cat_result = await db.execute(
            select(Category).where(Category.token == ie.category_token)
        )
        category = cat_result.scalar_one_or_none()
        if category is None:
            return None
        instance = Instance(
            token=ie.token,
            category_token=ie.category_token,
            nbr_annotations=0,
            first_annotation_token=None,
            last_annotation_token=None,
        )
        instance.category = category
    ann.instance = instance

    # ── visibility リレーション ──
    if edit.visibility_token is not None:
        vis_result = await db.execute(
            select(Visibility).where(Visibility.token == edit.visibility_token)
        )
        ann.visibility = vis_result.scalar_one_or_none()
    else:
        ann.visibility = None

    # ── attributes リレーション ──
    attrs: list[Attribute] = []
    if edit.attribute_tokens:
        attr_result = await db.execute(
            select(Attribute).where(Attribute.token.in_(edit.attribute_tokens))
        )
        attrs = list(attr_result.scalars().all())
    ann.attributes = attrs

    # ── sample リレーション ──
    # Sample は instance クエリでは取れていないので別途取得
    sample_result = await db.execute(
        select(Sample).where(Sample.token == edit.sample_token)
    )
    ann.sample = sample_result.scalar_one_or_none()

    return ann


# ── リストマージ ────────────────────────────────────────────────────────────────

async def merge_annotations(
    db: AsyncSession,
    base_annotations: Sequence[SampleAnnotation],
    edits: Sequence[AnnotationEdit],
) -> list[SampleAnnotation]:
    """base_annotations と edits をマージして結果のリストを返す.

    手順:
      1. 'delete' edits の base_token を集合化 → 除外
      2. 'modify' edits を base_token でインデックス化 → 各 base に適用
      3. 'add' edits を SampleAnnotation に合成 → 結果に追加

    NOTE: 戻り値の順序は base_annotations の順 + add の順.
    """
    delete_set     = {e.base_token for e in edits if e.edit_type == 'delete' and e.base_token}
    modify_by_base = {e.base_token: e for e in edits if e.edit_type == 'modify' and e.base_token}
    adds           = [e for e in edits if e.edit_type == 'add']

    result: list[SampleAnnotation] = []
    for base in base_annotations:
        if base.token in delete_set:
            continue
        edit = modify_by_base.get(base.token)
        if edit is not None:
            apply_modify(base, edit)
            await apply_attribute_tokens(db, base, edit.attribute_tokens)
            await apply_visibility(db, base, edit.visibility_token)
        result.append(base)

    for add_edit in adds:
        synthesized = await synthesize_from_add(db, add_edit)
        if synthesized is not None:
            result.append(synthesized)

    return result


# ── Instance 関連の動的計算 ────────────────────────────────────────────────────

async def compute_instance_stats(
    db: AsyncSession,
    instance_token: str,
) -> tuple[int, str | None, str | None]:
    """instance_token に紐づく annotations (マージ済み) から
    (nbr_annotations, first_annotation_token, last_annotation_token) を計算する.

    sample.timestamp 昇順で並べて, 先頭/末尾の token を取得.
    削除済み (delete edit がある base_token) は除外.
    """
    # base annotations (既存 SampleAnnotation)
    base_result = await db.execute(
        select(SampleAnnotation)
        .join(Sample, Sample.token == SampleAnnotation.sample_token)
        .where(SampleAnnotation.instance_token == instance_token)
        .order_by(Sample.timestamp)
    )
    base_anns = list(base_result.scalars().all())

    # edits (この instance の全 edits)
    edits_result = await db.execute(
        select(AnnotationEdit).where(AnnotationEdit.instance_token == instance_token)
    )
    edits = list(edits_result.scalars().all())

    delete_set = {e.base_token for e in edits if e.edit_type == 'delete' and e.base_token}
    adds       = [e for e in edits if e.edit_type == 'add']

    # delete を除外した base_anns
    visible_base = [a for a in base_anns if a.token not in delete_set]

    # add edits を sample.timestamp 順に挿入するため, sample を取得
    add_anns_with_ts: list[tuple[int, str]] = []  # (timestamp, token)
    for add in adds:
        if add.sample_token is None:
            continue
        sample_result = await db.execute(
            select(Sample).where(Sample.token == add.sample_token)
        )
        sample = sample_result.scalar_one_or_none()
        if sample is None:
            continue
        add_anns_with_ts.append((sample.timestamp, add.token))

    # マージして時系列に並べる
    all_with_ts: list[tuple[int, str]] = [
        (a.sample.timestamp if a.sample else 0, a.token) for a in visible_base
    ]
    all_with_ts.extend(add_anns_with_ts)
    all_with_ts.sort(key=lambda x: x[0])

    nbr = len(all_with_ts)
    first_token = all_with_ts[0][1] if nbr > 0 else None
    last_token  = all_with_ts[-1][1] if nbr > 0 else None
    return nbr, first_token, last_token
