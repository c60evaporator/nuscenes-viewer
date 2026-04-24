"""バックエンド設定ファイル (settings.yml) のロードとアクセス。

起動時に1回だけ設定ファイルを読み込んでキャッシュします。
設定ファイルのパスは環境変数 APP_CONFIG_PATH で上書きできます。

使用例:
    from app.core.app_config import get_map_origins

    origins = get_map_origins()
    lat, lon = origins["boston-seaport"]
"""
import logging
import os
from pathlib import Path
from typing import Any

import yaml

logger = logging.getLogger(__name__)

# ── 設定ファイルのロード ───────────────────────────────────────────────────────

def _load_yaml(path: Path) -> dict[str, Any]:
    if not path.exists():
        logger.warning("App config file not found: %s. Using empty config.", path)
        return {}
    with path.open(encoding="utf-8") as f:
        data = yaml.safe_load(f)
    logger.info("Loaded app config: %s", path)
    return data or {}


def _resolve_config_path() -> Path:
    """APP_CONFIG_PATH 環境変数 → core/config.Settings の順でパスを解決する。"""
    env_path = os.environ.get("APP_CONFIG_PATH")
    if env_path:
        return Path(env_path)
    # settings のインポートは循環参照リスクがあるため try/except で保護
    try:
        from app.core.config import settings
        return Path(settings.APP_CONFIG_PATH)
    except Exception:
        return Path("/app/config/settings.yml")


# モジュールロード時に1回だけ読み込む
_config: dict[str, Any] = _load_yaml(_resolve_config_path())


# ── 公開 API ──────────────────────────────────────────────────────────────────

def get_map_origins() -> dict[str, tuple[float, float]]:
    """ロケーション名 → (lat, lon) のマッピングを返す。

    settings.yml の map_origins セクションから読み込む。
    新しいロケーションを追加する場合は settings.yml に追記してください。
    """
    raw: dict[str, Any] = _config.get("map_origins", {})
    return {
        loc: (float(v["lat"]), float(v["lon"]))
        for loc, v in raw.items()
    }


def get_raw_config() -> dict[str, Any]:
    """設定ファイルの内容をそのまま返す（デバッグ・将来の拡張用）。"""
    return dict(_config)
