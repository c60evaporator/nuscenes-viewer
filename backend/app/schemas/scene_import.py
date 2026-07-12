"""POST /api/v1/scenes/import のリクエスト/レスポンススキーマ.

フロントエンド (src/types/sceneImport.ts) と 1:1 で対応する。
"""
from pydantic import BaseModel


class ImportErrorItem(BaseModel):
    """整合性エラー 1 件（どのファイルのどの token が問題か）.

    Python 組み込みの ImportError と衝突するため ImportErrorItem と命名
    （フロントエンドの型名とも一致）。
    """
    file:    str | None = None
    token:   str | None = None
    message: str


class SceneImportResult(BaseModel):
    dry_run:           bool
    ok:                bool
    imported_counts:   dict[str, int]   # {"scenes": 12, "samples": 480, ...}
    added_scene_names: list[str]        # ["scene-0646", ...] モーダルのサマリ表示用
    errors:            list[ImportErrorItem] = []
