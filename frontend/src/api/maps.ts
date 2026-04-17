import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './client'
import type { MapMeta, MapLayer, GeoJSONFeatureCollection } from '../types/map'
import type { PaginatedResponse } from '../types/common'

export function useBasemap(location: string | null) {
  return useQuery({
    queryKey: ['basemap', location],
    queryFn: async () => {
      const res = await fetch(`/api/v1/maps/${location}/basemap`)
      if (!res.ok) throw new Error('basemap fetch failed')
      const blob = await res.blob()
      return createImageBitmap(blob)
    },
    enabled:   !!location,
    staleTime: Infinity,
    gcTime:    Infinity,
  })
}

export function useMaps(params?: { limit?: number; offset?: number }) {
  const limit  = params?.limit  ?? 100
  const offset = params?.offset ?? 0
  return useQuery({
    queryKey: ['maps', limit, offset],
    queryFn:  () =>
      apiFetch<PaginatedResponse<MapMeta>>(`/maps?limit=${limit}&offset=${offset}`),
  })
}

// location 文字列でマップメタを取得（全件取得してフロントでフィルタ）
export function useMapByLocation(location: string | null) {
  return useQuery({
    queryKey: ['map-by-location', location],
    queryFn:  async () => {
      const res = await apiFetch<PaginatedResponse<MapMeta>>('/maps?limit=100&offset=0')
      const found = res.items.find((m) => m.location === location)
      if (!found) throw new Error(`Map not found for location: ${location}`)
      return found
    },
    enabled: !!location,
  })
}

export function useMapGeoJSON(token: string | null, layer: MapLayer | null) {
  return useQuery({
    queryKey: ['map-geojson', token, layer],
    queryFn:  () =>
      apiFetch<GeoJSONFeatureCollection>(`/maps/${token}/geojson?layer=${layer}`),
    enabled: !!token && !!layer,
  })
}
