import functools
import io
from pathlib import Path

import boto3
import botocore.exceptions

from app.core.config import settings


def _is_local() -> bool:
    return settings.DEPLOY_ENV == "local"


@functools.lru_cache(maxsize=1)
def _s3_client():
    return boto3.client("s3", region_name="ap-northeast-1")


def read_file(relative_path: str) -> bytes:
    """
    local: Read file from NUSCENES_DATAROOT / relative_path
    aws:   Read file from S3_DATA_BUCKET / relative_path

    relative_path is in the same format as nuScenes' sd.filename
    Example: "samples/CAM_FRONT/xxxx.jpg"
             "maps/36092f0b03a857c6a3403e25b4b7aab3.png"
    """
    if _is_local():
        path = Path(settings.NUSCENES_DATAROOT) / relative_path
        if not path.exists():
            raise FileNotFoundError(f"File not found: {path}")
        return path.read_bytes()
    try:
        obj = _s3_client().get_object(Bucket=settings.S3_DATA_BUCKET, Key=relative_path)
        return obj["Body"].read()
    except botocore.exceptions.ClientError as e:
        if e.response["Error"]["Code"] == "NoSuchKey":
            raise FileNotFoundError(f"S3 key not found: {relative_path}")
        raise


def get_presigned_url(relative_path: str, expires_in: int = 3600) -> str:
    """AWS 環境専用。S3 から直接ダウンロードできる署名付き URL を生成する。"""
    return _s3_client().generate_presigned_url(
        "get_object",
        Params={
            "Bucket":               settings.S3_DATA_BUCKET,
            "Key":                  relative_path,
            "ResponseCacheControl": "public, max-age=86400",
        },
        ExpiresIn=expires_in,
    )
