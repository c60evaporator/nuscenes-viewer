import type { GeoJSONMapFeature, MapLayer } from '@/types/map'
import { LAYER_LABELS } from '@/layers/MapAnnotationLayers'

interface MapAnnotationInfoProps {
  feature: GeoJSONMapFeature | null
  layer:   MapLayer | null
}

// Haversine 距離（メートル）
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R  = 6371000
  const φ1 = lat1 * Math.PI / 180
  const φ2 = lat2 * Math.PI / 180
  const dφ = (lat2 - lat1) * Math.PI / 180
  const dλ = (lon2 - lon1) * Math.PI / 180
  const a  = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Shoelace 面積（近似 m²、小エリア向け）
function polygonArea(ring: number[][]): number {
  if (ring.length < 3) return 0
  const midLat = ring.reduce((s, c) => s + c[1], 0) / ring.length * Math.PI / 180
  const mPerDegLon = 111320 * Math.cos(midLat)
  const mPerDegLat = 111320
  let area = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0] * mPerDegLon, yi = ring[i][1] * mPerDegLat
    const xj = ring[j][0] * mPerDegLon, yj = ring[j][1] * mPerDegLat
    area += xi * yj - xj * yi
  }
  return Math.abs(area / 2)
}

function computeArea(coords: unknown): number {
  // Polygon: coords is number[][][]
  // MultiPolygon: coords is number[][][][]
  if (!Array.isArray(coords)) return 0
  if (!Array.isArray(coords[0])) return 0
  if (typeof coords[0][0] === 'number') {
    // already a ring
    return polygonArea(coords as number[][])
  }
  if (!Array.isArray(coords[0][0])) return 0
  if (typeof coords[0][0][0] === 'number') {
    // Polygon outer ring
    return polygonArea(coords[0] as number[][])
  }
  // MultiPolygon
  return (coords as number[][][][]).reduce((sum, poly) => sum + polygonArea(poly[0]), 0)
}

function computeLength(coords: unknown): number {
  if (!Array.isArray(coords)) return 0
  if (!Array.isArray(coords[0])) return 0
  if (typeof coords[0] === 'number') return 0
  if (typeof coords[0][0] === 'number') {
    // LineString
    const pts = coords as number[][]
    let len = 0
    for (let i = 1; i < pts.length; i++) {
      len += haversine(pts[i-1][1], pts[i-1][0], pts[i][1], pts[i][0])
    }
    return len
  }
  // MultiLineString
  return (coords as number[][][]).reduce((sum, line) => {
    let len = 0
    for (let i = 1; i < line.length; i++) {
      len += haversine(line[i-1][1], line[i-1][0], line[i][1], line[i][0])
    }
    return sum + len
  }, 0)
}

function fmt(n: number, unit: string): string {
  if (n >= 1000) return `${(n / 1000).toFixed(2)} k${unit}`
  return `${n.toFixed(1)} ${unit}`
}

export default function MapAnnotationInfo({ feature, layer }: MapAnnotationInfoProps) {
  if (!feature) {
    return (
      <p className="text-gray-400 text-xs">アノテーションをクリックしてください</p>
    )
  }

  const geomType = feature.geometry?.type ?? 'Unknown'
  const isPolygon = geomType === 'Polygon' || geomType === 'MultiPolygon'
  const isLine    = geomType === 'LineString' || geomType === 'MultiLineString'

  return (
    <div>
      {/* レイヤー名 + ジオメトリ種別 */}
      <div className="mb-2 pb-2 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-700">
          {layer ? LAYER_LABELS[layer] : '—'}
        </p>
        <p className="text-xs text-gray-400">{geomType}</p>
      </div>

      {/* 面積 / 長さ */}
      {isPolygon && (
        <div className="flex flex-col gap-0.5 py-1.5 border-b border-gray-100">
          <span className="text-xs text-gray-400">Area</span>
          <span className="text-xs text-gray-700">
            {fmt(computeArea(feature.geometry?.coordinates), 'm²')}
          </span>
        </div>
      )}
      {isLine && (
        <div className="flex flex-col gap-0.5 py-1.5 border-b border-gray-100">
          <span className="text-xs text-gray-400">Length</span>
          <span className="text-xs text-gray-700">
            {fmt(computeLength(feature.geometry?.coordinates), 'm')}
          </span>
        </div>
      )}

      {/* properties */}
      {Object.entries(feature.properties ?? {}).map(([key, value]) => (
        <div key={key} className="flex flex-col gap-0.5 py-1.5 border-b border-gray-100 last:border-0">
          <span className="text-xs text-gray-400">{key}</span>
          <span className="text-xs text-gray-700 break-all">
            {value === null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value)}
          </span>
        </div>
      ))}
    </div>
  )
}
