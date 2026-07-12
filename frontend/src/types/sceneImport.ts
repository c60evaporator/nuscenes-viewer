// バックエンドの POST /api/v1/scenes/import レスポンス（SceneImportResult）と対応
// AddScene.md「Create」参照

export interface ImportErrorItem {
  file?:    string
  token?:   string
  message:  string
}

export interface SceneImportResult {
  dry_run:           boolean
  ok:                boolean
  imported_counts:   Record<string, number>   // {"scenes":12,"samples":480,...}
  added_scene_names: string[]                  // ["scene-0646", ...] サマリ表示用
  errors:            ImportErrorItem[]
}
