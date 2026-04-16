import { create } from 'zustand'
import type { MapLayer } from '@/types/map'

export const ALL_MAP_LAYERS: MapLayer[] = [
  'drivable_area',
  'road_segment',
  'road_block',
  'lane',
  'lane_connector',
  'carpark_area',
  'stop_line',
  'ped_crossing',
  'walkway',
  'road_divider',
  'lane_divider',
  'traffic_light',
]

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
