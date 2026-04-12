"""Unit tests for SceneConverter, and PaginatedResponse.

DB 接続不要。ORM モデルを直接インスタンス化してコンバーターロジックのみを検証する。
"""
import pytest

from app.converters.scene import SceneConverter
from app.models.scene import Log, Sample, Scene
from app.schemas.common import PaginatedResponse
from app.schemas.scene import LogResponse, SampleResponse, SceneResponse


# ── SceneConverter のテスト ────────────────────────────────────────────────────

def _make_scene(
    token: str = "scene-unit-001",
    log_token: str = "log-unit-001",
    name: str = "scene-unit-alpha",
    description: str | None = "A test scene",
    nbr_samples: int = 5,
    first_sample_token: str = "sample-unit-001",
    last_sample_token: str = "sample-unit-005",
) -> Scene:
    return Scene(
        token=token,
        log_token=log_token,
        name=name,
        description=description,
        nbr_samples=nbr_samples,
        first_sample_token=first_sample_token,
        last_sample_token=last_sample_token,
    )


def test_to_response_returns_scene_response():
    """戻り値が SceneResponse 型であること。"""
    result = SceneConverter.to_response(_make_scene())
    assert isinstance(result, SceneResponse)


def test_scene_all_fields_mapped():
    """Scene の全フィールドが SceneResponse に正しくマップされること。"""
    scene = _make_scene(
        token="tok-s",
        log_token="tok-l",
        name="my-scene",
        description="desc",
        nbr_samples=3,
        first_sample_token="first",
        last_sample_token="last",
    )
    result = SceneConverter.to_response(scene)
    assert result.token == "tok-s"
    assert result.log_token == "tok-l"
    assert result.name == "my-scene"
    assert result.description == "desc"
    assert result.nbr_samples == 3
    assert result.first_sample_token == "first"
    assert result.last_sample_token == "last"


@pytest.mark.parametrize("description,expected", [
    (None, None),
    ("", ""),
    ("some description", "some description"),
])
def test_scene_description_parametrize(description, expected):
    """description が None / 空文字 / 通常値でも正しく変換されること。"""
    scene = _make_scene(description=description)
    result = SceneConverter.to_response(scene)
    assert result.description == expected


def test_scene_nbr_samples_zero():
    """nbr_samples=0 のとき 0 になること。"""
    scene = _make_scene(nbr_samples=0)
    result = SceneConverter.to_response(scene)
    assert result.nbr_samples == 0


# ── LogResponse のテスト ──────────────────────────────────────────────────────

def test_to_log_response_all_fields():
    """Log の全フィールドが LogResponse に正しくマップされること。"""
    log = Log(
        token="log-unit-001",
        logfile="test.log",
        vehicle="test-vehicle-a",
        date_captured="2024-06-01",
        location="boston-seaport",
    )
    result = SceneConverter.to_log_response(log)
    assert isinstance(result, LogResponse)
    assert result.token == "log-unit-001"
    assert result.logfile == "test.log"
    assert result.vehicle == "test-vehicle-a"
    assert result.date_captured == "2024-06-01"
    assert result.location == "boston-seaport"


# ── SampleConverter のテスト ──────────────────────────────────────────────────

def _make_sample(
    token: str = "sample-unit-001",
    scene_token: str = "scene-unit-001",
    timestamp: int = 1_000_000,
    prev: str | None = "sample-unit-000",
    next_: str | None = "sample-unit-002",
) -> Sample:
    return Sample(
        token=token,
        scene_token=scene_token,
        timestamp=timestamp,
        prev=prev,
        next=next_,
    )


def test_sample_all_fields_mapped():
    """Sample の全フィールドが SampleResponse に正しくマップされること。"""
    sample = _make_sample(
        token="s-tok",
        scene_token="sc-tok",
        timestamp=9_999_999,
        prev="s-prev",
        next_="s-next",
    )
    result = SceneConverter.to_sample_response(sample)
    assert isinstance(result, SampleResponse)
    assert result.token == "s-tok"
    assert result.scene_token == "sc-tok"
    assert result.timestamp == 9_999_999
    assert result.prev == "s-prev"
    assert result.next == "s-next"


def test_sample_timestamp_preserved():
    """timestamp が変換されずそのまま保持されること。"""
    ts = 1_714_000_000_000_000
    sample = _make_sample(timestamp=ts)
    result = SceneConverter.to_sample_response(sample)
    assert result.timestamp == ts


def test_sample_prev_none():
    """先頭サンプル（prev=None）が正しく扱われること。"""
    sample = _make_sample(prev=None)
    result = SceneConverter.to_sample_response(sample)
    assert result.prev is None


def test_sample_next_none():
    """末尾サンプル（next=None）が正しく扱われること。"""
    sample = _make_sample(next_=None)
    result = SceneConverter.to_sample_response(sample)
    assert result.next is None


def test_sample_both_prev_next_none():
    """先頭かつ末尾（prev=None, next=None）のサンプルが正しく扱われること。"""
    sample = _make_sample(prev=None, next_=None)
    result = SceneConverter.to_sample_response(sample)
    assert result.prev is None
    assert result.next is None


# ── PaginatedResponse のテスト ────────────────────────────────────────────────

def test_paginated_response_fields():
    """items / total / limit / offset が正しく設定されること。"""
    items = ["a", "b", "c"]
    resp = PaginatedResponse(total=10, limit=3, offset=0, items=items)
    assert resp.total == 10
    assert resp.limit == 3
    assert resp.offset == 0
    assert resp.items == ["a", "b", "c"]


def test_paginated_response_empty_items():
    """items が空リストのとき空リストになること。"""
    resp = PaginatedResponse(total=0, limit=50, offset=0, items=[])
    assert resp.items == []
    assert resp.total == 0


def test_paginated_response_partial_page():
    """中間ページ（total > len(items)）が正しく表現されること。"""
    resp = PaginatedResponse(total=100, limit=10, offset=20, items=list(range(10)))
    assert resp.total == 100
    assert resp.offset == 20
    assert len(resp.items) == 10
