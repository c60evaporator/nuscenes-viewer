import functools
import io
from pathlib import Path

import boto3
import botocore.exceptions
from botocore.config import Config

from app.core.config import settings


def _is_local() -> bool:
    return settings.DEPLOY_ENV == "local"


@functools.lru_cache(maxsize=1)
def _s3_client():
    return boto3.client(
        "s3",
        region_name="ap-northeast-1",
        endpoint_url="https://s3.ap-northeast-1.amazonaws.com",  # To avoid unforeseen redirection that may cause CORS issues
        config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
    )


def read_file(relative_path: str) -> bytes:
    """
    local: Read file from NUSCENES_DATAROOT / relative_path
    aws:   Read file from S3_DATA_BUCKET / data / relative_path

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
        obj = _s3_client().get_object(Bucket=settings.S3_DATA_BUCKET, Key=f"data/{relative_path}")
        return obj["Body"].read()
    except botocore.exceptions.ClientError as e:
        if e.response["Error"]["Code"] == "NoSuchKey":
            raise FileNotFoundError(f"S3 key not found: data/{relative_path}")
        raise

def get_cloudfront_url(relative_path: str) -> str:
    """AWS環境専用。CloudFront経由の固定URLを返し、キャッシュによる高速化を図る。公開データの配信に適している。"""
    return f"{settings.CLOUDFRONT_DATA_URL}/data/{relative_path}"

def get_presigned_url(relative_path: str, expires_in: int = 1800) -> str:
    """AWS 環境専用。S3 から直接ダウンロードできる署名付きURL生成する。認証付き＆同一端末でのアクセスに適している。"""
    return _s3_client().generate_presigned_url(
        "get_object",
        Params={
            "Bucket":               settings.S3_DATA_BUCKET,
            "Key":                  f"data/{relative_path}",
            "ResponseCacheControl": "public, max-age=86400",
        },
        ExpiresIn=expires_in,
    )
