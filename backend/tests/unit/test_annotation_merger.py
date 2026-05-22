"""apply_modify のユニットテスト.

NOTE: set_committed_value() の使用により MagicMock では検証が困難になったため,
本格的な検証は backend/tests/integration/test_api_annotations_edits.py の
test_patch_then_get_returns_merged 等で行う.

ここでは set_committed_value() を介さない単純な挙動 (返り値の identity 等) のみ確認する.
"""
from app.services.annotation_merger import apply_modify
from app.models.annotation import SampleAnnotation
from app.models.annotation_edit import AnnotationEdit


def _make_base(translation=None, rotation=None, size=None, prev=None, next_=None, visibility_token=None):
    return SampleAnnotation(
        token='test-base-token',
        sample_token='test-sample',
        instance_token='test-instance',
        translation=translation if translation is not None else [0.0, 0.0, 0.0],
        rotation=rotation if rotation is not None else [1.0, 0.0, 0.0, 0.0],
        size=size if size is not None else [1.0, 1.0, 1.0],
        prev=prev,
        next=next_,
        num_lidar_pts=0,
        num_radar_pts=0,
        visibility_token=visibility_token,
    )


def _make_edit(translation=None, rotation=None, size=None, prev=None, next_=None,
               visibility_token=None, prev_cleared=False, next_cleared=False):
    return AnnotationEdit(
        token='test-edit-token',
        base_token='test-base-token',
        edit_type='modify',
        sample_token='test-sample',
        instance_token='test-instance',
        translation=translation,
        rotation=rotation,
        size=size,
        prev=prev,
        next=next_,
        prev_cleared=prev_cleared,
        next_cleared=next_cleared,
        visibility_token=visibility_token,
        attribute_tokens=None,
        version=1,
    )


def test_apply_modify_overwrites_translation():
    base = _make_base(translation=[0.0, 0.0, 0.0])
    edit = _make_edit(translation=[1.0, 2.0, 3.0])
    result = apply_modify(base, edit)
    assert result.translation == [1.0, 2.0, 3.0]


def test_apply_modify_overwrites_all_fields():
    base = _make_base()
    edit = _make_edit(
        translation=[1.0, 2.0, 3.0],
        rotation=[0.0, 1.0, 0.0, 0.0],
        size=[2.0, 3.0, 4.0],
        prev="prev-tok",
        next_="next-tok",
        visibility_token="vis-tok",
    )
    result = apply_modify(base, edit)
    assert result.translation == [1.0, 2.0, 3.0]
    assert result.rotation == [0.0, 1.0, 0.0, 0.0]
    assert result.size == [2.0, 3.0, 4.0]
    assert result.prev == "prev-tok"
    assert result.next == "next-tok"
    assert result.visibility_token == "vis-tok"


def test_apply_modify_null_fields_preserved():
    """edit のフィールドが None なら, base の値が維持されること."""
    base = _make_base(translation=[5.0, 6.0, 7.0], rotation=[0.9, 0.1, 0.0, 0.0])
    edit = _make_edit(translation=None, rotation=None, size=[1.0, 1.0, 1.0])
    result = apply_modify(base, edit)
    assert result.translation == [5.0, 6.0, 7.0]
    assert result.rotation == [0.9, 0.1, 0.0, 0.0]
    assert result.size == [1.0, 1.0, 1.0]


def test_apply_modify_returns_base_instance():
    """apply_modify は base インスタンスをそのまま返すこと."""
    base = _make_base()
    edit = _make_edit(translation=[1.0, 1.0, 1.0])
    result = apply_modify(base, edit)
    assert result is base


def test_apply_modify_prev_next_overwrite():
    """元が None でも edit が非 None なら上書きされること."""
    base = _make_base(prev=None, next_=None)
    edit = _make_edit(prev="new-prev", next_="new-next")
    result = apply_modify(base, edit)
    assert result.prev == "new-prev"
    assert result.next == "new-next"


def test_apply_modify_prev_next_preserve_when_none():
    """元の prev/next が非 None で edit が None かつ cleared=False なら, 元の値を維持."""
    base = _make_base(prev="orig-prev", next_="orig-next")
    edit = _make_edit(prev=None, next_=None, prev_cleared=False, next_cleared=False)
    result = apply_modify(base, edit)
    assert result.prev == "orig-prev"
    assert result.next == "orig-next"


def test_apply_modify_prev_cleared_sets_null():
    """prev_cleared=True なら base.prev が None に上書きされること."""
    base = _make_base(prev="orig-prev")
    edit = _make_edit(prev=None, prev_cleared=True)
    result = apply_modify(base, edit)
    assert result.prev is None


def test_apply_modify_next_cleared_sets_null():
    """next_cleared=True なら base.next が None に上書きされること."""
    base = _make_base(next_="orig-next")
    edit = _make_edit(next_=None, next_cleared=True)
    result = apply_modify(base, edit)
    assert result.next is None
