import { create } from 'zustand'

interface ViewerState {
  currentSceneToken:  string | null
  currentSampleToken: string | null
  frame:              number
  setScene:  (token: string) => void
  setSample: (token: string) => void
  setFrame:  (frame: number) => void
}

export const useViewerStore = create<ViewerState>((set) => ({
  currentSceneToken:  null,
  currentSampleToken: null,
  frame:              0,
  setScene:  (token) => set({ currentSceneToken: token, frame: 0 }),
  setSample: (token) => set({ currentSampleToken: token }),
  setFrame:  (frame) => set({ frame }),
}))
