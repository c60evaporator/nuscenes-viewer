import type { Point3D, Quaternion, Dimensions3D } from './common'

export interface AnnotationUpdateRequest {
  center?:     Point3D
  dimensions?: Dimensions3D
  rotation?:   Quaternion
  attributes?: string[]
}

// GET /api/v1/categories レスポンスの各エントリ（CategoryResponse に対応）
export interface Category {
  token:       string
  name:        string
  description: string | null
}

// GET /api/v1/annotations レスポンスの各エントリ（AnnotationResponse に対応）
export interface Attribute {
  token:       string
  name:        string
  description: string | null
}

export interface Visibility {
  token:       string
  level:       string
  description: string | null
}

export interface Annotation {
  token:            string
  sample_token:     string
  instance_token:   string
  translation:      number[]   // [x, y, z] グローバル座標
  rotation:         number[]   // [w, x, y, z] クォータニオン
  size:             number[]   // [width, length, height]
  prev:             string | null
  next:             string | null
  num_lidar_pts:    number
  num_radar_pts:    number
  visibility_token: string | null
  category_token:   string
  attributes:       Attribute[]
  visibility:       Visibility | null
}

// GET /api/v1/instances/{token}/annotations レスポンス（InstanceAnnotationResponse に対応）
export interface InstanceAnnotation extends Annotation {
  timestamp: number
}

// GET /api/v1/instances/{token} レスポンス（InstanceResponse に対応）
export interface Instance {
  token:                  string
  category_token:         string
  category_name:          string
  nbr_annotations:        number
  first_annotation_token: string | null
  last_annotation_token:  string | null
}
