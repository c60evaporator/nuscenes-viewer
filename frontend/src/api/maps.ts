import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './client'
import type { MapMeta, MapLayer, GeoJSONFeatureCollection } from '../types/map'
import type { PaginatedResponse } from '../types/common'

const BASE = () => (import.meta.env.VITE_API_BASE_PATH as string | undefined) ?? '/api/v1'

// マップ画像 URL を返す（<img src={basemapUrl(location)} /> で使用）
export const basemapUrl = (location: string): string =>
  `${BASE()}/maps/${location}/basemap`

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
