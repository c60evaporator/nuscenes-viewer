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
  token:          string
  sensor_token:   string
  sensor_channel: string
  translation:    Point3D
  rotation:       Quaternion
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

// サンプルデータ（センサー1フレーム分のデータへの参照）
export interface SampleData {
  token:                  string
  sample_token:           string
  calibrated_sensor_token: string
  ego_pose_token:         string
  filename:               string       // ローカルファイルパス
  fileformat:             'jpg' | 'pcd' | 'bin' | 'npz'
  timestamp:              number
  is_key_frame:           boolean
  width:                  number | null  // カメラのみ
  height:                 number | null  // カメラのみ
}
