import { describe, it, expect, beforeEach } from 'vitest'
import { useEditStore } from '@/store/editStore'
import type { Annotation } from '@/types/annotation'
import { HISTORY_LIMIT } from '@/types/edit'

// ── テストデータ ──────────────────────────────────────────────────────────────

function makeAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    token:            'ann-001',
    sample_token:     'smp-001',
    instance_token:   'inst-001',
    translation:      [1.0, 2.0, 3.0],
    rotation:         [1.0, 0.0, 0.0, 0.0],
    size:             [2.0, 4.0, 1.5],
    prev:             null,
    next:             null,
    num_lidar_pts:    10,
    num_radar_pts:    0,
    visibility_token: 'v1',
    category_token:   'cat-001',
    attributes:       [{ token: 'attr-1', name: 'moving', description: null }],
    visibility:       null,
    ...overrides,
  }
}

// ── リセット ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  useEditStore.setState({ mode: 'view', session: null, activeEditor: null })
})

// ── startEditSession ──────────────────────────────────────────────────────────

describe('startEditSession', () => {
  it('sets mode=edit and session.mode=edit', () => {
    const ann = makeAnnotation()
    useEditStore.getState().startEditSession(ann)
    const state = useEditStore.getState()
    expect(state.mode).toBe('edit')
    expect(state.session?.mode).toBe('edit')
  })

  it('sets targetToken to annotation.token', () => {
    const ann = makeAnnotation({ token: 'my-token' })
    useEditStore.getState().startEditSession(ann)
    expect(useEditStore.getState().session?.targetToken).toBe('my-token')
  })

  it('extracts fixedSampleToken and fixedInstanceToken from annotation', () => {
    const ann = makeAnnotation({ sample_token: 'smp-X', instance_token: 'inst-X' })
    useEditStore.getState().startEditSession(ann)
    const session = useEditStore.getState().session!
    expect(session.fixedSampleToken).toBe('smp-X')
    expect(session.fixedInstanceToken).toBe('inst-X')
  })

  it('sets isInstanceSelectable=false', () => {
    useEditStore.getState().startEditSession(makeAnnotation())
    expect(useEditStore.getState().session?.isInstanceSelectable).toBe(false)
  })

  it('initializes history with [annotation] and historyIndex=0', () => {
    const ann = makeAnnotation()
    useEditStore.getState().startEditSession(ann)
    const session = useEditStore.getState().session!
    expect(session.history).toHaveLength(1)
    expect(session.history[0].token).toBe(ann.token)
    expect(session.historyIndex).toBe(0)
  })
})

// ── startAddSession ───────────────────────────────────────────────────────────

describe('startAddSession', () => {
  it('sets mode=add and session.mode=add', () => {
    useEditStore.getState().startAddSession({
      template:             makeAnnotation(),
      fixedSampleToken:     'smp-A',
      fixedInstanceToken:   'inst-A',
      isInstanceSelectable: false,
    })
    const state = useEditStore.getState()
    expect(state.mode).toBe('add')
    expect(state.session?.mode).toBe('add')
  })

  it('generates targetToken starting with "temp-"', () => {
    useEditStore.getState().startAddSession({
      template:             makeAnnotation(),
      fixedSampleToken:     'smp-A',
      fixedInstanceToken:   null,
      isInstanceSelectable: true,
    })
    expect(useEditStore.getState().session?.targetToken).toMatch(/^temp-/)
  })

  it('stores fixedSampleToken, fixedInstanceToken, isInstanceSelectable correctly', () => {
    useEditStore.getState().startAddSession({
      template:             makeAnnotation(),
      fixedSampleToken:     'smp-B',
      fixedInstanceToken:   'inst-B',
      isInstanceSelectable: true,
    })
    const session = useEditStore.getState().session!
    expect(session.fixedSampleToken).toBe('smp-B')
    expect(session.fixedInstanceToken).toBe('inst-B')
    expect(session.isInstanceSelectable).toBe(true)
  })

  it('sets history[0].token to the temp token', () => {
    useEditStore.getState().startAddSession({
      template:             makeAnnotation(),
      fixedSampleToken:     'smp-C',
      fixedInstanceToken:   null,
      isInstanceSelectable: true,
    })
    const session = useEditStore.getState().session!
    expect(session.history[0].token).toBe(session.targetToken)
  })

  it('sets history[0].sample_token to fixedSampleToken', () => {
    useEditStore.getState().startAddSession({
      template:             makeAnnotation(),
      fixedSampleToken:     'smp-D',
      fixedInstanceToken:   null,
      isInstanceSelectable: true,
    })
    expect(useEditStore.getState().session!.history[0].sample_token).toBe('smp-D')
  })

  it('sets history[0].instance_token to "" when fixedInstanceToken=null', () => {
    useEditStore.getState().startAddSession({
      template:             makeAnnotation(),
      fixedSampleToken:     'smp-E',
      fixedInstanceToken:   null,
      isInstanceSelectable: true,
    })
    expect(useEditStore.getState().session!.history[0].instance_token).toBe('')
  })

  it('initializes historyIndex=0', () => {
    useEditStore.getState().startAddSession({
      template:             makeAnnotation(),
      fixedSampleToken:     'smp-F',
      fixedInstanceToken:   null,
      isInstanceSelectable: false,
    })
    expect(useEditStore.getState().session!.historyIndex).toBe(0)
  })
})

// ── endSession ────────────────────────────────────────────────────────────────

describe('endSession', () => {
  it('resets mode=view, session=null, activeEditor=null', () => {
    useEditStore.getState().startEditSession(makeAnnotation())
    useEditStore.getState().setActiveEditor('bev')
    useEditStore.getState().endSession()
    const state = useEditStore.getState()
    expect(state.mode).toBe('view')
    expect(state.session).toBeNull()
    expect(state.activeEditor).toBeNull()
  })
})

// ── updateSessionLive ─────────────────────────────────────────────────────────

describe('updateSessionLive', () => {
  it('does nothing when session is null', () => {
    expect(() => useEditStore.getState().updateSessionLive({ translation: [9, 9, 9] })).not.toThrow()
    expect(useEditStore.getState().session).toBeNull()
  })

  it('merges changes into history[historyIndex]', () => {
    useEditStore.getState().startEditSession(makeAnnotation())
    useEditStore.getState().updateSessionLive({ translation: [10, 20, 30] })
    const ann = useEditStore.getState().getCurrentAnnotation()!
    expect(ann.translation).toEqual([10, 20, 30])
  })

  it('does not increase history.length', () => {
    useEditStore.getState().startEditSession(makeAnnotation())
    useEditStore.getState().updateSessionLive({ translation: [1, 2, 3] })
    useEditStore.getState().updateSessionLive({ translation: [4, 5, 6] })
    expect(useEditStore.getState().session!.history).toHaveLength(1)
  })

  it('reflects the last value on repeated calls', () => {
    useEditStore.getState().startEditSession(makeAnnotation())
    useEditStore.getState().updateSessionLive({ translation: [1, 0, 0] })
    useEditStore.getState().updateSessionLive({ translation: [5, 5, 5] })
    expect(useEditStore.getState().getCurrentAnnotation()!.translation).toEqual([5, 5, 5])
  })

  it('updates draft without touching history when called during undo state', () => {
    useEditStore.getState().startEditSession(makeAnnotation())
    useEditStore.getState().updateSessionLive({ translation: [1, 1, 1] })
    useEditStore.getState().commitChange()
    useEditStore.getState().updateSessionLive({ translation: [2, 2, 2] })
    useEditStore.getState().commitChange()
    // undo to index 1
    useEditStore.getState().undo()
    expect(useEditStore.getState().session!.historyIndex).toBe(1)
    // live update changes draft only
    useEditStore.getState().updateSessionLive({ translation: [99, 99, 99] })
    expect(useEditStore.getState().session!.historyIndex).toBe(1)
    expect(useEditStore.getState().getCurrentAnnotation()!.translation).toEqual([99, 99, 99])
    // history length unchanged by live update
    expect(useEditStore.getState().session!.history).toHaveLength(3)
  })
})

// ── commitChange ──────────────────────────────────────────────────────────────

describe('commitChange', () => {
  it('does nothing when session is null', () => {
    expect(() => useEditStore.getState().commitChange()).not.toThrow()
  })

  it('pushes a new snapshot: history.length=2, historyIndex=1 after first commit', () => {
    useEditStore.getState().startEditSession(makeAnnotation())
    useEditStore.getState().updateSessionLive({ translation: [5, 5, 5] })
    useEditStore.getState().commitChange()
    const session = useEditStore.getState().session!
    expect(session.history).toHaveLength(2)
    expect(session.historyIndex).toBe(1)
  })

  it('does not add a snapshot when value is unchanged (diff guard)', () => {
    useEditStore.getState().startEditSession(makeAnnotation())
    useEditStore.getState().updateSessionLive({ translation: [5, 5, 5] })
    useEditStore.getState().commitChange()
    // same value again
    useEditStore.getState().updateSessionLive({ translation: [5, 5, 5] })
    useEditStore.getState().commitChange()
    expect(useEditStore.getState().session!.history).toHaveLength(2)
  })

  it('discards future history after undo + commit', () => {
    useEditStore.getState().startEditSession(makeAnnotation({ translation: [0, 0, 0] }))
    // build history: [a, b, c, d]
    useEditStore.getState().updateSessionLive({ translation: [1, 0, 0] })
    useEditStore.getState().commitChange()  // idx=1
    useEditStore.getState().updateSessionLive({ translation: [2, 0, 0] })
    useEditStore.getState().commitChange()  // idx=2
    useEditStore.getState().updateSessionLive({ translation: [3, 0, 0] })
    useEditStore.getState().commitChange()  // idx=3
    // undo twice → idx=1
    useEditStore.getState().undo()
    useEditStore.getState().undo()
    expect(useEditStore.getState().session!.historyIndex).toBe(1)
    // new commit at idx=1 → discards idx=2,3 and pushes new
    useEditStore.getState().updateSessionLive({ translation: [99, 0, 0] })
    useEditStore.getState().commitChange()
    const session = useEditStore.getState().session!
    expect(session.history).toHaveLength(3)
    expect(session.historyIndex).toBe(2)
    expect(session.history[2].translation).toEqual([99, 0, 0])
  })

  it('drops history[1] (not history[0]) when HISTORY_LIMIT is exceeded', () => {
    useEditStore.getState().startEditSession(makeAnnotation({ translation: [0, 0, 0] }))
    const initial = { ...useEditStore.getState().session!.history[0] }

    // commit HISTORY_LIMIT times (history grows to HISTORY_LIMIT+1 before trim)
    for (let i = 1; i <= HISTORY_LIMIT; i++) {
      useEditStore.getState().updateSessionLive({ translation: [i, 0, 0] })
      useEditStore.getState().commitChange()
    }

    const session = useEditStore.getState().session!
    expect(session.history).toHaveLength(HISTORY_LIMIT)
    // history[0] is the original initial state
    expect(session.history[0].translation).toEqual(initial.translation)
    // historyIndex points to the last entry
    expect(session.historyIndex).toBe(HISTORY_LIMIT - 1)
  })
})

// ── undo / redo / canUndo / canRedo ──────────────────────────────────────────

describe('undo / redo / canUndo / canRedo', () => {
  it('returns false for canUndo and canRedo when session is null', () => {
    expect(useEditStore.getState().canUndo()).toBe(false)
    expect(useEditStore.getState().canRedo()).toBe(false)
  })

  it('undo and redo do nothing when session is null', () => {
    expect(() => useEditStore.getState().undo()).not.toThrow()
    expect(() => useEditStore.getState().redo()).not.toThrow()
  })

  it('canUndo=false, canRedo=false immediately after session start', () => {
    useEditStore.getState().startEditSession(makeAnnotation())
    expect(useEditStore.getState().canUndo()).toBe(false)
    expect(useEditStore.getState().canRedo()).toBe(false)
  })

  it('canUndo=true, canRedo=false after one commit', () => {
    useEditStore.getState().startEditSession(makeAnnotation())
    useEditStore.getState().updateSessionLive({ translation: [1, 0, 0] })
    useEditStore.getState().commitChange()
    expect(useEditStore.getState().canUndo()).toBe(true)
    expect(useEditStore.getState().canRedo()).toBe(false)
  })

  it('canUndo=false, canRedo=true after undo to initial', () => {
    useEditStore.getState().startEditSession(makeAnnotation())
    useEditStore.getState().updateSessionLive({ translation: [1, 0, 0] })
    useEditStore.getState().commitChange()
    useEditStore.getState().undo()
    expect(useEditStore.getState().canUndo()).toBe(false)
    expect(useEditStore.getState().canRedo()).toBe(true)
  })

  it('undo at index=0 does nothing', () => {
    useEditStore.getState().startEditSession(makeAnnotation())
    useEditStore.getState().undo()
    expect(useEditStore.getState().session!.historyIndex).toBe(0)
  })

  it('redo at last index does nothing', () => {
    useEditStore.getState().startEditSession(makeAnnotation())
    useEditStore.getState().updateSessionLive({ translation: [1, 0, 0] })
    useEditStore.getState().commitChange()
    useEditStore.getState().redo()
    expect(useEditStore.getState().session!.historyIndex).toBe(1)
  })
})

// ── getCurrentAnnotation ──────────────────────────────────────────────────────

describe('getCurrentAnnotation', () => {
  it('returns null when session is null', () => {
    expect(useEditStore.getState().getCurrentAnnotation()).toBeNull()
  })

  it('returns history[historyIndex]', () => {
    const ann = makeAnnotation()
    useEditStore.getState().startEditSession(ann)
    expect(useEditStore.getState().getCurrentAnnotation()?.token).toBe(ann.token)
  })

  it('returns older snapshot after undo', () => {
    useEditStore.getState().startEditSession(makeAnnotation({ translation: [0, 0, 0] }))
    useEditStore.getState().updateSessionLive({ translation: [7, 7, 7] })
    useEditStore.getState().commitChange()
    expect(useEditStore.getState().getCurrentAnnotation()!.translation).toEqual([7, 7, 7])
    useEditStore.getState().undo()
    expect(useEditStore.getState().getCurrentAnnotation()!.translation).toEqual([0, 0, 0])
  })
})

// ── isDirty ───────────────────────────────────────────────────────────────────

describe('isDirty', () => {
  it('returns false when session is null', () => {
    expect(useEditStore.getState().isDirty()).toBe(false)
  })

  it('returns false immediately after session start', () => {
    useEditStore.getState().startEditSession(makeAnnotation())
    expect(useEditStore.getState().isDirty()).toBe(false)
  })

  it('returns true after updateSessionLive changes a value', () => {
    useEditStore.getState().startEditSession(makeAnnotation({ translation: [0, 0, 0] }))
    useEditStore.getState().updateSessionLive({ translation: [1, 0, 0] })
    expect(useEditStore.getState().isDirty()).toBe(true)
  })

  it('returns true after commit', () => {
    useEditStore.getState().startEditSession(makeAnnotation({ translation: [0, 0, 0] }))
    useEditStore.getState().updateSessionLive({ translation: [1, 0, 0] })
    useEditStore.getState().commitChange()
    expect(useEditStore.getState().isDirty()).toBe(true)
  })

  it('returns false after undo back to initial', () => {
    useEditStore.getState().startEditSession(makeAnnotation({ translation: [0, 0, 0] }))
    useEditStore.getState().updateSessionLive({ translation: [1, 0, 0] })
    useEditStore.getState().commitChange()
    useEditStore.getState().undo()
    expect(useEditStore.getState().isDirty()).toBe(false)
  })

  it('returns false when updateSessionLive sets the same value', () => {
    const ann = makeAnnotation({ translation: [1, 2, 3] })
    useEditStore.getState().startEditSession(ann)
    useEditStore.getState().updateSessionLive({ translation: [1, 2, 3] })
    expect(useEditStore.getState().isDirty()).toBe(false)
  })
})

// ── setActiveEditor ───────────────────────────────────────────────────────────

describe('setActiveEditor', () => {
  it.each(['bev', '3d', 'keyboard', 'button', 'input', null] as const)(
    'sets activeEditor to %s',
    (editor) => {
      useEditStore.getState().setActiveEditor(editor)
      expect(useEditStore.getState().activeEditor).toBe(editor)
    },
  )
})
