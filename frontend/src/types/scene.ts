// バックエンドの schemas/scene.py と対応

export interface Scene {
  token:       string
  name:        string
  description: string
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

// 一覧取得のレスポンス（ページネーション共通）
export interface PaginatedResponse<T> {
  items:  T[]
  total:  number
  limit:  number
  offset: number
}

export type SceneListResponse  = PaginatedResponse<Scene>
export type SampleListResponse = PaginatedResponse<Sample>
