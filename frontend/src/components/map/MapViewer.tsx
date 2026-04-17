import { useEffect, useRef, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import DeckGL from '@deck.gl/react'
import { MapView } from '@deck.gl/core'
import type { MapViewState } from '@deck.gl/core'
import { BitmapLayer } from '@deck.gl/layers'
import { apiFetch } from '@/api/client'
import { useBasemap } from '@/api/maps'
import { useMapLayerStore, ALL_MAP_LAYERS } from '@/store/mapLayerStore'
import { createGeoJsonLayer } from '@/layers/MapAnnotationLayers'
import MapLegend from './MapLegend'
import type { GeoJSONFeatureCollection, GeoJSONMapFeature, MapLayer } from '@/types/map'

interface MapViewerProps {
  mapToken:       string | null
  location:       string | null
  onFeatureClick: (feature: GeoJSONMapFeature, layer: MapLayer) => void
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

export default function MapViewer({ mapToken, location, onFeatureClick }: MapViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const enabledLayers = useMapLayerStore((s) => s.enabledLayers)

  // deck.gl 9.x requires { [viewId]: MapViewState } record format
  const [viewState, setViewState] = useState<Record<string, MapViewState>>({
    main: { longitude: 0, latitude: 0, zoom: 1, pitch: 0, bearing: 0 },
  })
  const [viewInitialized, setViewInitialized] = useState(false)
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

  // Viewport 初期化（データが揃った初回のみ）
  useEffect(() => {
    if (viewInitialized) return
    const collections = Object.values(layerData).filter(Boolean)
    if (collections.length === 0) return

    const bounds = computeBounds(collections as GeoJSONFeatureCollection[])
    if (!bounds) return

    const container = containerRef.current
    if (!container) return
    const { clientWidth: w, clientHeight: h } = container
    if (w === 0 || h === 0) return

    const [west, south, east, north] = bounds
    const lon = (west + east)   / 2
    const lat = (south + north) / 2

    // 簡易ズーム計算（WebMercatorViewport.fitBounds の代替）
    const latRange = north - south
    const lonRange = east  - west
    const zoom = Math.min(
      Math.log2(360 / lonRange) + Math.log2(w  / 512) - 1,
      Math.log2(180 / latRange) + Math.log2(h  / 512) - 1,
      18,
    )

    setViewState((prev) => ({
      ...prev,
      main: { longitude: lon, latitude: lat, zoom: Math.max(zoom, 1), pitch: 0, bearing: 0 },
    }))
    setViewInitialized(true)
  }, [layerData, viewInitialized])

  // 有効レイヤーが変わったとき Viewport を再初期化できるようにリセット
  useEffect(() => {
    setViewInitialized(false)
  }, [mapToken])

  // GeoJsonLayer 生成
  const geoJsonLayers = ALL_MAP_LAYERS
    .filter((layer) => enabledLayers.has(layer) && layerData[layer])
    .map((layer) =>
      createGeoJsonLayer(layer, layerData[layer]!, onFeatureClick),
    )

  // BitmapLayer（bounds が確定している場合のみ表示）
  const allCollections = Object.values(layerData) as GeoJSONFeatureCollection[]
  const bounds = computeBounds(allCollections)
  const bitmapLayer = bounds && basemapBitmap
    ? new BitmapLayer({
        id:     'basemap',
        image:  basemapBitmap,
        bounds: bounds,
      })
    : null

  const layers = [
    ...(bitmapLayer ? [bitmapLayer] : []),
    ...geoJsonLayers,
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
        style={{ width: '100%', height: '100%' }}
      />
      <MapLegend enabledLayers={enabledLayers} />
    </div>
  )
}
