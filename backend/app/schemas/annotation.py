from pydantic import BaseModel, ConfigDict


class AttributeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    token: str
    name: str
    description: str | None


class CategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    token: str
    name: str
    description: str | None


class VisibilityResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    token: str
    level: str
    description: str | None


class AnnotationResponse(BaseModel):
    token: str
    sample_token: str
    instance_token: str
    translation: list[float]   # [x, y, z] 中心座標（グローバル座標）
    rotation: list[float]      # [w, x, y, z] クォータニオン
    size: list[float]          # [width, length, height]
    prev: str | None
    next: str | None
    num_lidar_pts: int
    num_radar_pts: int
    visibility_token: str | None
    # instance 経由で展開
    category_token: str
    attributes: list[AttributeResponse]
    visibility: VisibilityResponse | None


class SampleInstanceResponse(BaseModel):
    instance_token: str
    category_name: str
    nbr_annotations: int


class InstanceAnnotationResponse(AnnotationResponse):
    """instances/{token}/annotations 用: AnnotationResponse + timestamp"""
    timestamp: int


class InstanceResponse(BaseModel):
    """GET /instances および GET /instances/{token} のレスポンス"""
    token:                  str
    category_token:         str
    category_name:          str          # Instance.category.name リレーションシップから
    nbr_annotations:        int
    first_annotation_token: str | None
    last_annotation_token:  str | None

# ------ Update ------

class AnnotationUpdate(BaseModel):
    """PATCH 用: 送ったフィールドだけ更新する"""
    translation: list[float] | None = None
    rotation: list[float] | None = None
    size: list[float] | None = None
    visibility_token: str | None = None
    attribute_tokens: list[str] | None = None

# ------ Create ------

class InstanceCreate(BaseModel):
    """新規 Instance 作成用ペイロード."""
    category_token: str


class AnnotationCreate(BaseModel):
    """POST /annotations 用: 新規 BBox 追加.

    instance_token と new_instance は排他的:
      - instance_token が指定されれば既存 Instance に追加
      - new_instance が指定されれば新規 InstanceEdit を作成して追加
    """
    sample_token:     str
    instance_token:   str | None = None
    new_instance:     InstanceCreate | None = None
    translation:      list[float]
    rotation:         list[float]
    size:             list[float]
    prev:             str | None = None
    next:             str | None = None
    visibility_token: str | None = None
    attribute_tokens: list[str] = []
