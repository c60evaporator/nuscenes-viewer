// バックエンド schemas の SceneDeleteResult と 1:1 対応
export interface SceneDeleteResult {
  deleted_scene_token: string
  deleted_scene_name:  string
  deleted_counts:      Record<string, number>  // {"scenes": 1, "samples": 40, ...}
}
