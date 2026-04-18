import { create } from 'zustand'

interface ViewerState {
  currentMapLocation:     string | null
  currentSceneToken:      string | null
  currentSampleToken:     string | null
  currentInstanceToken:   string | null
  currentAnnotationToken: string | null

  setMapLocation: (location: string | null) => void
  setScene:       (token: string | null) => void
  setSample:      (token: string | null) => void
  setInstance:    (token: string | null) => void
  setAnnotation:  (token: string | null) => void
}

export const useViewerStore = create<ViewerState>((set) => ({
  currentMapLocation:     null,
  currentSceneToken:      null,
  currentSampleToken:     null,
  currentInstanceToken:   null,
  currentAnnotationToken: null,

  setMapLocation: (location) => set({
    currentMapLocation:     location,
    currentSceneToken:      null,
    currentSampleToken:     null,
    currentInstanceToken:   null,
    currentAnnotationToken: null,
  }),
  // シーン変更時はサンプル選択をリセット
  setScene:       (token)    => set({ currentSceneToken: token, currentSampleToken: null }),
  setSample:      (token)    => set({ currentSampleToken: token }),
  setInstance:    (token)    => set({ currentInstanceToken: token }),
  setAnnotation:  (token)    => set({ currentAnnotationToken: token }),
}))
