"""Unit tests for AnnotationConverter.to_response.

DB 接続不要。ORM オブジェクトを MagicMock で模擬してコンバーターロジックのみを検証する。
"""
from unittest.mock import MagicMock

import pytest

from app.converters.annotation import AnnotationConverter
from app.schemas.annotation import AnnotationResponse, AttributeResponse, VisibilityResponse


# ── テスト用ファクトリ ─────────────────────────────────────────────────────────

def _make_attribute(
    token: str = "attr-1",
    name: str = "vehicle.moving",
    description: str | None = "The vehicle is moving.",
) -> MagicMock:
    """Attribute ORM オブジェクトのモック。"""
    attr = MagicMock(spec=["token", "name", "description"])
    attr.token = token
    attr.name = name
    attr.description = description
    return attr


def _make_visibility(
    token: str = "4",
    level: str = "v80-100",
    description: str | None = "visibility of whole object is between 80 and 100%",
) -> MagicMock:
    """Visibility ORM オブジェクトのモック。"""
    vis = MagicMock(spec=["token", "level", "description"])
    vis.token = token
    vis.level = level
    vis.description = description
    return vis


def _make_ann(
    token: str = "ann-token-001",
    sample_token: str = "sample-token-001",
    instance_token: str = "instance-token-001",
    translation: list[float] | None = None,
    rotation: list[float] | None = None,
    size: list[float] | None = None,
    prev: str | None = None,
    next_: str | None = "ann-token-002",
    num_lidar_pts: int = 10,
    num_radar_pts: int = 0,
    visibility_token: str | None = "4",
    category_token: str = "cat-token-001",
    attributes: list | None = None,
    visibility: MagicMock | None = None,
) -> MagicMock:
    """SampleAnnotation ORM オブジェクトのモック。"""
    ann = MagicMock()
    ann.token = token
    ann.sample_token = sample_token
    ann.instance_token = instance_token
    ann.translation = translation if translation is not None else [1.0, 2.0, 3.0]
    ann.rotation = rotation if rotation is not None else [1.0, 0.0, 0.0, 0.0]
    ann.size = size if size is not None else [2.0, 4.0, 1.5]
    ann.prev = prev
    ann.next = next_
    ann.num_lidar_pts = num_lidar_pts
    ann.num_radar_pts = num_radar_pts
    ann.visibility_token = visibility_token
    ann.instance.category_token = category_token
    ann.attributes = attributes if attributes is not None else []
    ann.visibility = visibility
    return ann


# ── 正常系 ────────────────────────────────────────────────────────────────────

def test_to_response_returns_annotation_response():
    """戻り値が AnnotationResponse 型であること。"""
    ann = _make_ann()
    result = AnnotationConverter.to_response(ann)
    assert isinstance(result, AnnotationResponse)


def test_translation_is_passed_through():
    """translation [x, y, z] がそのまま出力されること。"""
    coords = [12.34, 56.78, 1.23]
    ann = _make_ann(translation=coords)
    result = AnnotationConverter.to_response(ann)
    assert result.translation == coords


def test_rotation_is_passed_through():
    """rotation [w, x, y, z] クォータニオンがそのまま出力されること。"""
    quat = [0.9831, 0.0, 0.0, -0.1830]
    ann = _make_ann(rotation=quat)
    result = AnnotationConverter.to_response(ann)
    assert result.rotation == quat


def test_size_is_passed_through():
    """size [width, length, height] がそのまま出力されること。"""
    dims = [0.621, 0.669, 1.642]
    ann = _make_ann(size=dims)
    result = AnnotationConverter.to_response(ann)
    assert result.size == dims


def test_scalar_fields_are_passed_through():
    """token / sample_token / instance_token / num_lidar_pts 等のスカラー値が正しく渡ること。"""
    ann = _make_ann(
        token="tok-x",
        sample_token="smp-x",
        instance_token="inst-x",
        num_lidar_pts=42,
        num_radar_pts=3,
        visibility_token="2",
    )
    result = AnnotationConverter.to_response(ann)
    assert result.token == "tok-x"
    assert result.sample_token == "smp-x"
    assert result.instance_token == "inst-x"
    assert result.num_lidar_pts == 42
    assert result.num_radar_pts == 3
    assert result.visibility_token == "2"


def test_category_token_from_instance():
    """category_token は ann.instance.category_token から取得されること。"""
    ann = _make_ann(category_token="cat-pedestrian")
    result = AnnotationConverter.to_response(ann)
    assert result.category_token == "cat-pedestrian"


def test_prev_next_passed_through():
    """prev / next がそのまま出力されること（None も含む）。"""
    ann = _make_ann(prev="ann-prev", next_="ann-next")
    result = AnnotationConverter.to_response(ann)
    assert result.prev == "ann-prev"
    assert result.next == "ann-next"


def test_prev_none():
    """先頭アノテーション（prev=None）が正しく扱われること。"""
    ann = _make_ann(prev=None)
    result = AnnotationConverter.to_response(ann)
    assert result.prev is None


# ── 境界値: visibility=None ────────────────────────────────────────────────────

def test_visibility_none_when_no_visibility_object():
    """ann.visibility が None のとき response.visibility は None になること。"""
    ann = _make_ann(visibility=None)
    result = AnnotationConverter.to_response(ann)
    assert result.visibility is None


def test_visibility_token_preserved_even_when_visibility_object_is_none():
    """ann.visibility が None でも visibility_token フィールドは保持されること。"""
    ann = _make_ann(visibility_token="1", visibility=None)
    result = AnnotationConverter.to_response(ann)
    assert result.visibility_token == "1"
    assert result.visibility is None


def test_visibility_object_converted_to_response():
    """ann.visibility が存在するとき VisibilityResponse に変換されること。"""
    vis = _make_visibility(token="4", level="v80-100")
    ann = _make_ann(visibility_token="4", visibility=vis)
    result = AnnotationConverter.to_response(ann)
    assert isinstance(result.visibility, VisibilityResponse)
    assert result.visibility.token == "4"
    assert result.visibility.level == "v80-100"


# ── 属性リスト: 空のケース ────────────────────────────────────────────────────

def test_attributes_empty_list():
    """attributes が空リストのとき response.attributes も空リストになること。"""
    ann = _make_ann(attributes=[])
    result = AnnotationConverter.to_response(ann)
    assert result.attributes == []


# ── 属性リスト: 複数のケース ──────────────────────────────────────────────────

def test_attributes_single():
    """attributes が1件のとき AttributeResponse が1件になること。"""
    attr = _make_attribute(token="attr-1", name="vehicle.moving")
    ann = _make_ann(attributes=[attr])
    result = AnnotationConverter.to_response(ann)
    assert len(result.attributes) == 1
    assert isinstance(result.attributes[0], AttributeResponse)
    assert result.attributes[0].token == "attr-1"
    assert result.attributes[0].name == "vehicle.moving"


def test_attributes_multiple():
    """attributes が複数のとき全件が AttributeResponse に変換されること。"""
    attrs = [
        _make_attribute(token="attr-1", name="vehicle.moving", description="Moving."),
        _make_attribute(token="attr-2", name="vehicle.stopped", description="Stopped."),
        _make_attribute(token="attr-3", name="cycle.with_rider", description="With rider."),
    ]
    ann = _make_ann(attributes=attrs)
    result = AnnotationConverter.to_response(ann)
    assert len(result.attributes) == 3
    tokens = [a.token for a in result.attributes]
    names = [a.name for a in result.attributes]
    assert tokens == ["attr-1", "attr-2", "attr-3"]
    assert names == ["vehicle.moving", "vehicle.stopped", "cycle.with_rider"]


def test_attributes_description_none():
    """attributes の description が None でも変換できること。"""
    attr = _make_attribute(token="attr-1", name="pedestrian.standing", description=None)
    ann = _make_ann(attributes=[attr])
    result = AnnotationConverter.to_response(ann)
    assert result.attributes[0].description is None
