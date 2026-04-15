// バックエンドの schemas/map.py と対応

// GET /api/v1/maps レスポンスの各エントリ（MapMetaResponse に対応）
export interface MapMeta {
  token:       string
  location:    string          // 'boston-seaport' など
  version:     string
  canvas_edge: number[]        // [width_m, height_m]
}

// マップレイヤー種別（MapLayer enum に対応）
export type MapLayer =
  | 'drivable_area'
  | 'road_segment'
  | 'road_block'
  | 'lane'
  | 'lane_connector'
  | 'carpark_area'
  | 'stop_line'
  | 'ped_crossing'
  | 'walkway'
  | 'road_divider'
  | 'lane_divider'
  | 'traffic_light'

// GeoJSON 型（GeoJSONFeatureCollection レスポンスに対応）
export interface GeoJSONGeometry {
  type:        string
  coordinates: unknown
}

export interface GeoJSONMapFeature {
  type:       'Feature'
  geometry:   GeoJSONGeometry | null
  properties: Record<string, unknown>
}

export interface GeoJSONFeatureCollection {
  type:     'FeatureCollection'
  features: GeoJSONMapFeature[]
}

// GET /api/v1/instances/{token}/best-camera レスポンス（BestCameraResponse に対応）
export interface BestCamera {
  channel:           string   // 'CAM_FRONT' など
  sample_data_token: string
}
