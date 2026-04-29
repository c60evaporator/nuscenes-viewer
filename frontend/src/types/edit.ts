import type { Annotation } from './annotation'

export type EditMode = 'view' | 'edit' | 'add'

export type ActiveEditor = 'bev' | '3d' | 'keyboard' | 'button' | 'input' | null

export interface EditSession {
    /** 'edit' or 'add' (view時はsession自体がnull) */
    mode: 'edit' | 'add'

    /** 編集中のtoken。editなら既存token、addなら'temp-{uuid}'形式の仮token */
    targetToken: string

    /** 保存時に使う固定パラメータ */
    fixedSampleToken:   string
    fixedInstanceToken: string | null  // null は 'new instance' を意味する

    /** Add BBox時にinstanceドロップダウンを操作可能にするか
     *  - Sampleフィルタ中の Add BBox: true (ユーザーが選択 or new)
     *  - Instanceフィルタ中の Add BBox to prev/next: false (固定)
     *  - Edit BBox: false (常に固定)
     */
    isInstanceSelectable: boolean

    /** スナップショット履歴 (新しいものほど末尾、history[0]は初期状態・不変) */
    history: Annotation[]

    /** 現在表示中のスナップショットインデックス (最後にcommitした位置) */
    historyIndex: number

    /** 現在の作業中状態 (updateSessionLiveで更新、commitChangeで履歴にpush) */
    draft: Annotation
}

/** 履歴の上限 */
export const HISTORY_LIMIT = 50
