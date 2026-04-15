import { create } from 'zustand'
import type { NavigationState } from '../types/navigation'

interface NavigationStoreState extends NavigationState {
  lock: (
    source: 'scene' | 'sample' | 'instance',
    tokens: {
      sceneToken?:    string
      sampleToken?:   string
      instanceToken?: string
      categoryName?:  string
    }
  ) => void
  unlock: () => void
}

export const useNavigationStore = create<NavigationStoreState>((set) => ({
  lockedSceneToken:    null,
  lockedSampleToken:   null,
  lockedInstanceToken: null,
  lockedCategoryName:  null,
  lockSource:          null,

  lock: (source, tokens) =>
    set({
      lockSource:          source,
      lockedSceneToken:    tokens.sceneToken    ?? null,
      lockedSampleToken:   tokens.sampleToken   ?? null,
      lockedInstanceToken: tokens.instanceToken ?? null,
      lockedCategoryName:  tokens.categoryName  ?? null,
    }),

  unlock: () =>
    set({
      lockSource:          null,
      lockedSceneToken:    null,
      lockedSampleToken:   null,
      lockedInstanceToken: null,
      lockedCategoryName:  null,
    }),
}))
