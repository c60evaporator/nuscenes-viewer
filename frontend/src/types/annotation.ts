import type { Point3D, Quaternion, Dimensions3D } from './common'

export interface BoundingBox3D {
  token:      string
  center:     Point3D
  dimensions: Dimensions3D
  rotation:   Quaternion
  category:   string
  attributes: string[]
  velocity:   Point3D | null
}

export interface AnnotationUpdateRequest {
  center?:     Point3D
  dimensions?: Dimensions3D
  rotation?:   Quaternion
  attributes?: string[]
}
