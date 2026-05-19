import { create } from 'zustand'
import type { MapLayer } from '@/types/map'
import { LAYER_DISPLAY_ORDER } from '@/config/settings'

// settings.yml の layer_display_order を使用（順序変更は settings.yml を編集する）
export const ALL_MAP_LAYERS: MapLayer[] = [...LAYER_DISPLAY_ORDER] as MapLayer[]

const DEFAULT_LAYERS = new Set<MapLayer>([
  'road_segment',
  'lane',
  'road_divider',
  'lane_divider',
  'ped_crossing',
])

interface MapLayerState {
  enabledLayers: Set<MapLayer>
  toggleLayer:   (layer: MapLayer) => void
}

export const useMapLayerStore = create<MapLayerState>((set) => ({
  enabledLayers: new Set(DEFAULT_LAYERS),

  toggleLayer: (layer) =>
    set((state) => {
      const next = new Set(state.enabledLayers)
      if (next.has(layer)) next.delete(layer)
      else next.add(layer)
      return { enabledLayers: next }
    }),
}))
