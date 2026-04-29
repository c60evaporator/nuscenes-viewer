import { create } from 'zustand'
import type { Annotation } from '@/types/annotation'
import type { ActiveEditor, EditMode, EditSession } from '@/types/edit'
import { HISTORY_LIMIT } from '@/types/edit'

interface EditStoreState {
  // ── 状態 ─────────────────────────────────────────────────────────────
  mode:         EditMode
  session:      EditSession | null
  activeEditor: ActiveEditor

  // ── セッション管理 ──────────────────────────────────────────────────
  startEditSession: (annotation: Annotation) => void
  startAddSession: (params: {
    template:             Annotation
    fixedSampleToken:     string
    fixedInstanceToken:   string | null
    isInstanceSelectable: boolean
  }) => void
  endSession: () => void

  // ── 編集 ─────────────────────────────────────────────────────────────
  updateSessionLive: (changes: Partial<Annotation>) => void
  commitChange: () => void

  // ── 履歴 ─────────────────────────────────────────────────────────────
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean

  // ── 状態取得 ─────────────────────────────────────────────────────────
  getCurrentAnnotation: () => Annotation | null
  isDirty: () => boolean

  // ── 排他制御 ─────────────────────────────────────────────────────────
  setActiveEditor: (editor: ActiveEditor) => void
}

export const useEditStore = create<EditStoreState>((set, get) => ({
  mode:         'view',
  session:      null,
  activeEditor: null,

  startEditSession: (annotation) => {
    const initial = { ...annotation }
    set({
      mode: 'edit',
      session: {
        mode:                 'edit',
        targetToken:          annotation.token,
        fixedSampleToken:     annotation.sample_token,
        fixedInstanceToken:   annotation.instance_token,
        isInstanceSelectable: false,
        history:              [initial],
        historyIndex:         0,
        draft:                { ...initial },
      },
    })
  },

  startAddSession: ({ template, fixedSampleToken, fixedInstanceToken, isInstanceSelectable }) => {
    const tempToken = `temp-${crypto.randomUUID()}`
    const initial: Annotation = {
      ...template,
      token:          tempToken,
      sample_token:   fixedSampleToken,
      instance_token: fixedInstanceToken ?? '',
    }
    set({
      mode: 'add',
      session: {
        mode:                 'add',
        targetToken:          tempToken,
        fixedSampleToken,
        fixedInstanceToken,
        isInstanceSelectable,
        history:              [{ ...initial }],
        historyIndex:         0,
        draft:                { ...initial },
      },
    })
  },

  endSession: () => {
    set({ mode: 'view', session: null, activeEditor: null })
  },

  updateSessionLive: (changes) => {
    const session = get().session
    if (!session) return
    set({ session: { ...session, draft: { ...session.draft, ...changes } } })
  },

  commitChange: () => {
    const session = get().session
    if (!session) return

    // historyIndex以降を破棄 (Undo後の新規操作時)
    const trimmed = session.history.slice(0, session.historyIndex + 1)

    // 最後のコミット済みスナップショットと差分なしなら何もしない (連打対策)
    const lastCommitted = trimmed[trimmed.length - 1]
    if (deepEqualAnnotation(session.draft, lastCommitted)) return

    let newHistory = [...trimmed, { ...session.draft }]

    // 上限超過時: history[0] を保持しつつ history[1] を削除
    if (newHistory.length > HISTORY_LIMIT) {
      newHistory = [newHistory[0], ...newHistory.slice(2)]
    }

    set({
      session: {
        ...session,
        history:      newHistory,
        historyIndex: newHistory.length - 1,
      },
    })
  },

  undo: () => {
    const session = get().session
    if (!session || session.historyIndex <= 0) return
    const newIndex = session.historyIndex - 1
    set({
      session: {
        ...session,
        historyIndex: newIndex,
        draft:        { ...session.history[newIndex] },
      },
    })
  },

  redo: () => {
    const session = get().session
    if (!session || session.historyIndex >= session.history.length - 1) return
    const newIndex = session.historyIndex + 1
    set({
      session: {
        ...session,
        historyIndex: newIndex,
        draft:        { ...session.history[newIndex] },
      },
    })
  },

  canUndo: () => {
    const session = get().session
    return !!session && session.historyIndex > 0
  },

  canRedo: () => {
    const session = get().session
    return !!session && session.historyIndex < session.history.length - 1
  },

  getCurrentAnnotation: () => {
    const session = get().session
    if (!session) return null
    return session.draft
  },

  isDirty: () => {
    const session = get().session
    if (!session) return false
    return !deepEqualAnnotation(session.history[0], session.draft)
  },

  setActiveEditor: (editor) => set({ activeEditor: editor }),
}))

function deepEqualAnnotation(a: Annotation, b: Annotation): boolean {
  return (
    arrEq(a.translation, b.translation) &&
    arrEq(a.rotation,    b.rotation) &&
    arrEq(a.size,        b.size) &&
    a.visibility_token === b.visibility_token &&
    a.category_token   === b.category_token &&
    a.instance_token   === b.instance_token &&
    attrTokensEq(a.attributes, b.attributes)
  )
}

function arrEq(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

function attrTokensEq(a: { token: string }[], b: { token: string }[]): boolean {
  if (a.length !== b.length) return false
  const sa = new Set(a.map(x => x.token))
  for (const x of b) if (!sa.has(x.token)) return false
  return true
}
