import { useEffect, useRef, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import DeckGL from '@deck.gl/react'
import { MapView } from '@deck.gl/core'
import type { MapViewState } from '@deck.gl/core'
import { BitmapLayer, GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers'
import { apiFetch } from '@/api/client'
import { useBasemap } from '@/api/maps'
import { useMapLayerStore, ALL_MAP_LAYERS } from '@/store/mapLayerStore'
import { createGeoJsonLayer } from '@/layers/MapAnnotationLayers'
import { getBasemapBounds, localToWgs84 } from '@/lib/coordinateUtils'
import MapLegend from './MapLegend'
import type { GeoJSONFeatureCollection, GeoJSONMapFeature, MapLayer } from '@/types/map'
import type { EgoPosePoint } from '@/types/sensor'

interface MapViewerProps {
  mapToken:            string | null
  location:            string | null
  onFeatureClick:      (feature: GeoJSONMapFeature, layer: MapLayer) => void
  selectedFeature:     GeoJSONMapFeature | null
  selectedLayer:       MapLayer | null
  egoPoses?:           EgoPosePoint[]
  currentSampleToken?: string | null
}


// 全フィーチャーの WGS84 bounds を計算
function computeBounds(
  collections: (GeoJSONFeatureCollection | undefined)[],
): [number, number, number, number] | null {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity

  const visit = (coords: unknown): void => {
    if (!Array.isArray(coords)) return
    if (typeof coords[0] === 'number') {
      west  = Math.min(west,  coords[0] as number)
      east  = Math.max(east,  coords[0] as number)
      south = Math.min(south, coords[1] as number)
      north = Math.max(north, coords[1] as number)
    } else {
      ;(coords as unknown[]).forEach(visit)
    }
  }

  for (const col of collections) {
    if (!col) continue
    for (const f of col.features) {
      if (f.geometry?.coordinates) visit(f.geometry.coordinates)
    }
  }

  return isFinite(west) ? [west, south, east, north] : null
}

export default function MapViewer({ mapToken, location, onFeatureClick, selectedFeature, selectedLayer, egoPoses, currentSampleToken }: MapViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const enabledLayers = useMapLayerStore((s) => s.enabledLayers)

  // deck.gl 9.x requires { [viewId]: MapViewState } record format
  const [viewState, setViewState] = useState<Record<string, MapViewState>>({
    main: { longitude: 0, latitude: 0, zoom: 1, pitch: 0, bearing: 0 },
  })
  const [viewInitialized, setViewInitialized] = useState(false)
  const [hoveredCursor, setHoveredCursor] = useState<string | null>(null)
  const { data: basemapBitmap } = useBasemap(location)

  // 全 12 レイヤーを並列フェッチ（有効なもののみ実行）
  const results = useQueries({
    queries: ALL_MAP_LAYERS.map((layer) => ({
      queryKey:  ['map-geojson', mapToken, layer] as const,
      queryFn:   () => apiFetch<GeoJSONFeatureCollection>(`/maps/${mapToken}/geojson?layer=${layer}`),
      enabled:   !!mapToken && enabledLayers.has(layer),
      staleTime: 5 * 60 * 1000,
    })),
  })

  // ロード済みデータ: ALL_MAP_LAYERS[i] → results[i].data
  const layerData = ALL_MAP_LAYERS.reduce<Partial<Record<MapLayer, GeoJSONFeatureCollection>>>(
    (acc, layer, i) => {
      if (results[i].data) acc[layer] = results[i].data
      return acc
    },
    {},
  )

  // Scene切り替え時に Viewport を再初期化（Ego Poses モード）
  const trajectoryKey = egoPoses?.[0]?.sample_token ?? ''
  useEffect(() => {
    if (egoPoses && egoPoses.length > 0) setViewInitialized(false)
  }, [trajectoryKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Viewport 初期化（egoPoses 優先、なければ GeoJSON bounds）
  useEffect(() => {
    if (viewInitialized) return
    const container = containerRef.current
    if (!container) return
    const { clientWidth: w, clientHeight: h } = container
    if (w === 0 || h === 0) return

    // ── Ego Poses が提供されている場合はその範囲にフィット ──────────────────
    if (egoPoses && egoPoses.length > 0 && location) {
      const points: [number, number][] = []
      for (const ep of egoPoses) {
        const wgs84 = localToWgs84(ep.translation[0], ep.translation[1], location)
        if (wgs84) points.push(wgs84)
      }
      if (points.length === 0) return

      const lons  = points.map(([lon]) => lon)
      const lats  = points.map(([, lat]) => lat)
      const west  = Math.min(...lons), east  = Math.max(...lons)
      const south = Math.min(...lats), north = Math.max(...lats)
      const lon   = (west  + east)  / 2
      const lat   = (south + north) / 2

      // 30% の余白を付けてズーム計算
      const padFactor = 1.3
      const latRange  = ((north - south) || 0.001) * padFactor
      const lonRange  = ((east  - west)  || 0.001) * padFactor
      const zoom = Math.min(
        Math.log2(360 / lonRange) + Math.log2(w / 512) - 1,
        Math.log2(180 / latRange) + Math.log2(h / 512) - 1,
        18,
      )
      setViewState((prev) => ({
        ...prev,
        main: { longitude: lon, latitude: lat, zoom: Math.max(zoom, 1), pitch: 0, bearing: 0 },
      }))
      setViewInitialized(true)
      return
    }

    // ── フォールバック: GeoJSON フィーチャーの bounds ───────────────────────
    const collections = Object.values(layerData).filter(Boolean)
    if (collections.length === 0) return
    const bounds = computeBounds(collections as GeoJSONFeatureCollection[])
    if (!bounds) return
    const [west, south, east, north] = bounds
    const lon = (west + east)   / 2
    const lat = (south + north) / 2
    const latRange = north - south
    const lonRange = east  - west
    const zoom = Math.min(
      Math.log2(360 / lonRange) + Math.log2(w / 512) - 1,
      Math.log2(180 / latRange) + Math.log2(h / 512) - 1,
      18,
    )
    setViewState((prev) => ({
      ...prev,
      main: { longitude: lon, latitude: lat, zoom: Math.max(zoom, 1), pitch: 0, bearing: 0 },
    }))
    setViewInitialized(true)
  }, [egoPoses, location, layerData, viewInitialized])

  // mapToken 変更時に Viewport を再初期化できるようにリセット
  useEffect(() => {
    setViewInitialized(false)
  }, [mapToken])

  // GeoJsonLayer 生成
  const geoJsonLayers = ALL_MAP_LAYERS
    .filter((layer) => enabledLayers.has(layer) && layerData[layer])
    .map((layer) =>
      createGeoJsonLayer(layer, layerData[layer]!, onFeatureClick, setHoveredCursor),
    )

  // BitmapLayer（canvas_edge 全体を WGS84 に変換した bounds を使用）
  const basemapBounds = location ? getBasemapBounds(location) : null
  const bitmapLayer = basemapBounds && basemapBitmap
    ? new BitmapLayer({
        id:     'basemap',
        image:  basemapBitmap,
        bounds: basemapBounds,
      })
    : null

  // Ego Poses を WGS84 に変換して ScatterplotLayer を生成
  const egoPosePoints: { position: [number, number]; isCurrent: boolean }[] = []
  if (egoPoses && location) {
    for (const ep of egoPoses) {
      const wgs84 = localToWgs84(ep.translation[0], ep.translation[1], location)
      if (wgs84) egoPosePoints.push({
        position: wgs84,
        isCurrent: ep.sample_token === currentSampleToken,
      })
    }
  }
  const egoPoseLayer = egoPosePoints.length > 0
    ? new ScatterplotLayer({
        id:           'ego-poses',
        data:         egoPosePoints,
        getPosition:  (d) => d.position,
        getRadius:    (d) => d.isCurrent ? 8 : 4,
        getFillColor: (d) => d.isCurrent ? [255, 80, 80, 255] : [255, 165, 0, 180],
        radiusUnits:  'pixels',
        pickable:     false,
      })
    : null

  // 選択フィーチャーの白アウトラインオーバーレイ（最前面・クリック非対象）
  const selectionLayer = selectedFeature
    ? new GeoJsonLayer({
        id:   'selection-outline',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { type: 'FeatureCollection', features: [selectedFeature] } as any,
        pickable:         false,
        filled:           false,
        stroked:          true,
        getLineColor:     [255, 238, 128, 255],
        getLineWidth:     3,
        lineWidthUnits:   'pixels',
        getPointRadius:   10,
        pointRadiusUnits: 'pixels',
      })
    : null

  const layers = [
    ...(bitmapLayer    ? [bitmapLayer]    : []),
    ...geoJsonLayers,
    ...(egoPoseLayer   ? [egoPoseLayer]   : []),
    ...(selectionLayer ? [selectionLayer] : []),
  ]

  if (!location || !mapToken) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
        Map を選択してください
      </div>
    )
  }

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-gray-900">
      <DeckGL
        viewState={viewState}
        onViewStateChange={({ viewId, viewState: vs }) =>
        setViewState((prev) => ({ ...prev, [(viewId as string) ?? 'main']: vs as MapViewState }))
      }
        views={[new MapView({ id: 'main', controller: true })]}
        layers={layers}
        getCursor={({ isDragging }) => isDragging ? 'grabbing' : (hoveredCursor ?? 'grab')}
        style={{ width: '100%', height: '100%' }}
      />
      <MapLegend enabledLayers={enabledLayers} />
    </div>
  )
}
