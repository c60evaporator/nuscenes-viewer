import { Checkbox } from '@/components/ui/checkbox'
import { useMapLayerStore, ALL_MAP_LAYERS } from '@/store/mapLayerStore'
import { LAYER_COLORS, LAYER_LABELS } from '@/layers/MapAnnotationLayers'
import type { MapLayer } from '@/types/map'

const POLYGON_LAYERS: MapLayer[] = [
  'drivable_area', 'road_segment', 'road_block', 'lane', 'lane_connector',
  'carpark_area', 'stop_line', 'ped_crossing', 'walkway',
]
const LINE_LAYERS:  MapLayer[] = ['road_divider', 'lane_divider']
const POINT_LAYERS: MapLayer[] = ['traffic_light']

function LayerGroup({ title, layers }: { title: string; layers: MapLayer[] }) {
  const enabledLayers = useMapLayerStore((s) => s.enabledLayers)
  const toggleLayer   = useMapLayerStore((s) => s.toggleLayer)

  return (
    <div className="mb-3">
      <p className="text-gray-400 text-xs font-semibold mb-1 uppercase tracking-wide">{title}</p>
      <div className="space-y-1">
        {layers.map((layer) => {
          const [r, g, b] = LAYER_COLORS[layer]
          const checked = enabledLayers.has(layer)
          return (
            <label
              key={layer}
              className="flex items-center gap-2 cursor-pointer hover:bg-white/5 px-1 py-0.5 rounded"
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => toggleLayer(layer)}
                className="border-gray-400 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
              />
              <div
                className="w-3 h-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: `rgb(${r},${g},${b})` }}
              />
              <span className="text-gray-200 text-xs">{LAYER_LABELS[layer]}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

export default function LayerCheckboxes() {
  return (
    <div className="p-3">
      <LayerGroup title="Polygon" layers={POLYGON_LAYERS} />
      <LayerGroup title="Line"    layers={LINE_LAYERS} />
      <LayerGroup title="Point"   layers={POINT_LAYERS} />
    </div>
  )
}

// Re-export for use in MapViewer
export { ALL_MAP_LAYERS }
