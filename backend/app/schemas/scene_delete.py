"""scene 削除（DELETE /scenes/{token}）の API スキーマ.

フロントエンド `src/types/sceneDelete.ts` と 1:1 対応させる。
"""
from pydantic import BaseModel


class SceneDeleteResult(BaseModel):
    deleted_scene_token: str
    deleted_scene_name:  str
    deleted_counts:      dict[str, int]  # {"scenes": 1, "samples": 40, ...}
