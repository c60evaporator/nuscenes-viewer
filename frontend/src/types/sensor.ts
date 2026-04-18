// バックエンドの schemas/sensor.py と対応
import type { Point3D, Quaternion, GeoJSONPoint } from './common'

// センサーの種類
export type SensorModality = 'camera' | 'lidar' | 'radar'

export interface Sensor {
  token:    string
  channel:  string            // 'CAM_FRONT', 'LIDAR_TOP' など
  modality: SensorModality
}

// キャリブレーション済みセンサー（車体座標系での位置・向き）
export interface CalibratedSensor {
  token:            string
  sensor_token:     string
  sensor_channel:   string
  translation:      Point3D
  rotation:         Quaternion
  camera_intrinsic: number[][] | null   // カメラのみ 3x3行列、LiDARはnull
}

// 自車位置（各サンプル時刻での車体のグローバル座標）
export interface EgoPose {
  token:       string
  timestamp:   number
  translation: Point3D
  rotation:    Quaternion
  // PostGISから変換したGeoJSON（地図上へのプロット用）
  geom:        GeoJSONPoint | null
}

// GET /api/v1/scenes/{token}/ego-poses レスポンス（SampleEgoPoseResponse に対応）
// translation/rotation は配列形式（EgoPose とは異なる）
export interface EgoPosePoint {
  sample_token: string
  timestamp:    number
  translation:  number[]   // [x, y, z]
  rotation:     number[]   // [w, x, y, z]
}

// サンプルデータ（センサー1フレーム分のデータへの参照）
export interface SampleData {
  token:                   string
  sample_token:            string
  calibrated_sensor_token: string
  ego_pose_token:          string
  filename:                string       // ローカルファイルパス
  fileformat:              'jpg' | 'pcd' | 'bin' | 'npz'
  timestamp:               number
  is_key_frame:            boolean
  width:                   number | null  // カメラのみ
  height:                  number | null  // カメラのみ
}

// GET /api/v1/samples/{token}/sensor-data レスポンスの各エントリ（SensorDataBriefResponse に対応）
export interface SensorDataBrief {
  token:                   string
  filename:                string
  fileformat:              string
  calibrated_sensor_token: string
}

// GET /api/v1/samples/{token}/sensor-data レスポンス全体
// キー: チャンネル名（'CAM_FRONT', 'LIDAR_TOP' など）
export type SensorDataMap = Record<string, SensorDataBrief>

// GET /api/v1/sensor-data/{token}/pointcloud レスポンス
export interface PointCloud {
  points:     number[][]  // 各点: [x, y, z, intensity]
  num_points: number
}

// GET /api/v1/samples/{token}/instances レスポンスの各エントリ（SampleInstanceResponse に対応）
export interface InstanceSummary {
  instance_token:  string
  category_name:   string
  nbr_annotations: number
}
