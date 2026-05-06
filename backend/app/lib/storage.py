import io
from pathlib import Path
import boto3
from app.core.config import settings


def _is_local() -> bool:
    return settings.DEPLOY_ENV == "local"

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
    else:
        s3 = boto3.client("s3", region_name="ap-northeast-1")
        try:
            obj = s3.get_object(Bucket=settings.S3_DATA_BUCKET, Key=relative_path)
            return obj["Body"].read()
        except s3.exceptions.NoSuchKey:
            raise FileNotFoundError(f"S3 key not found: {relative_path}")
