import { create } from 'zustand'

export type LayerId = 'pointcloud' | 'bbox3d' | 'ego_trajectory' | 'drivable_area' | 'lane'

interface LayerState {
  visibleLayers: Set<LayerId>
  toggle: (id: LayerId) => void
  isVisible: (id: LayerId) => boolean
}

export const useLayerStore = create<LayerState>((set, get) => ({
  visibleLayers: new Set(['pointcloud', 'bbox3d', 'drivable_area']),
  toggle: (id) => set((s) => {
    const next = new Set(s.visibleLayers)
    next.has(id) ? next.delete(id) : next.add(id)
    return { visibleLayers: next }
  }),
  isVisible: (id) => get().visibleLayers.has(id),
}))
