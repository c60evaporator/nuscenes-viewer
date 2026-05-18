"""Unit tests for annotation_merger.

DB 接続不要な純粋ロジック (apply_modify) のみテスト.
DB を使う部分 (synthesize_from_add, merge_annotations) は integration test で扱う.
"""
from unittest.mock import MagicMock

from app.services.annotation_merger import apply_modify


def _make_base(translation=None, rotation=None, size=None, prev=None, next_=None, visibility_token=None):
    base = MagicMock()
    base.translation = translation if translation is not None else [0.0, 0.0, 0.0]
    base.rotation    = rotation    if rotation    is not None else [1.0, 0.0, 0.0, 0.0]
    base.size        = size        if size        is not None else [1.0, 1.0, 1.0]
    base.prev        = prev
    base.next        = next_
    base.visibility_token = visibility_token
    return base


def _make_edit(translation=None, rotation=None, size=None, prev=None, next_=None, visibility_token=None):
    edit = MagicMock()
    edit.translation      = translation
    edit.rotation         = rotation
    edit.size             = size
    edit.prev             = prev
    edit.next             = next_
    edit.visibility_token = visibility_token
    return edit


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
    assert result.translation == [5.0, 6.0, 7.0]  # 維持
    assert result.rotation == [0.9, 0.1, 0.0, 0.0]  # 維持
    assert result.size == [1.0, 1.0, 1.0]  # 上書き


def test_apply_modify_returns_base_instance():
    """apply_modify は base インスタンスをそのまま返すこと (新しいオブジェクトを作らない)."""
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
    """元の prev/next が非 None で edit が None なら, 元の値を維持."""
    base = _make_base(prev="orig-prev", next_="orig-next")
    edit = _make_edit(prev=None, next_=None)
    result = apply_modify(base, edit)
    assert result.prev == "orig-prev"
    assert result.next == "orig-next"
