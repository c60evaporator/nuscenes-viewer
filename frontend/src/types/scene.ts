// バックエンドの schemas/scene.py と対応
import type { PaginatedResponse } from './common'

export interface Scene {
  token:       string
  name:        string
  description: string | null
  nbr_samples: number          // サンプル（フレーム）数
  first_sample_token: string
  last_sample_token:  string
  log_token:   string
}

export interface Sample {
  token:       string
  scene_token: string
  timestamp:   number          // UNIX timestamp（マイクロ秒）
  prev:        string | null   // 前フレームのtoken
  next:        string | null   // 次フレームのtoken
}

export type SceneListResponse  = PaginatedResponse<Scene>
export type SampleListResponse = PaginatedResponse<Sample>

// GET /api/v1/logs レスポンスの各エントリ（LogResponse に対応）
export interface Log {
  token:         string
  logfile:       string
  vehicle:       string
  date_captured: string
  location:      string
}

export type LogListResponse = PaginatedResponse<Log>
