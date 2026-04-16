import { LAYER_COLORS, LAYER_LABELS } from '@/layers/MapAnnotationLayers'
import type { MapLayer } from '@/types/map'

interface MapLegendProps {
  enabledLayers: Set<MapLayer>
}

export default function MapLegend({ enabledLayers }: MapLegendProps) {
  const visible = Array.from(enabledLayers)
  if (visible.length === 0) return null

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        backgroundColor: 'rgba(0,0,0,0.7)',
        borderRadius: 6,
        padding: '8px 10px',
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      {visible.map((layer) => {
        const [r, g, b] = LAYER_COLORS[layer]
        return (
          <div key={layer} className="flex items-center gap-2 mb-1 last:mb-0">
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 2,
                backgroundColor: `rgb(${r},${g},${b})`,
                flexShrink: 0,
              }}
            />
            <span style={{ color: '#fff', fontSize: 11 }}>{LAYER_LABELS[layer]}</span>
          </div>
        )
      })}
    </div>
  )
}
