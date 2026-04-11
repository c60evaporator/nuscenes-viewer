// バックエンドの schemas/common.py と対応させる
export interface Point3D {
  x: number
  y: number
  z: number
}

export interface Quaternion {
  w: number
  x: number
  y: number
  z: number
}

export interface Dimensions3D {
  width: number
  length: number
  height: number
}

export interface GeoJSONPoint {
  type: 'Point'
  coordinates: [number, number] | [number, number, number]
}

export interface GeoJSONFeature<G = GeoJSONPoint, P = Record<string, unknown>> {
  type: 'Feature'
  geometry: G
  properties: P
}
