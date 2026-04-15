// CLAUDE.md の navigationStore 型定義に対応

export interface NavigationState {
  // 画面遷移元からの固定フィルタ
  lockedSceneToken:    string | null   // Scene→Sample/Instance/Sample&Map遷移時
  lockedSampleToken:   string | null   // Sample→Annotation遷移時
  lockedInstanceToken: string | null   // Instance→Annotation遷移時
  lockedCategoryName:  string | null   // Sample→Instance遷移時

  // ロック元画面（ロック解除の判定に使用）
  lockSource: 'scene' | 'sample' | 'instance' | null
}
