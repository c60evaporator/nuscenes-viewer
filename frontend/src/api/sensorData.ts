import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './client'
import type { PointCloud } from '../types/sensor'

const BASE = () => (import.meta.env.VITE_API_BASE_PATH as string | undefined) ?? '/api/v1'

// カメラ画像 URL を返す（<img src={imageUrl(token)} /> で使用）
export const imageUrl = (token: string): string =>
  `${BASE()}/sensor-data/${token}/image`

export function usePointCloud(token: string | null) {
  return useQuery({
    queryKey: ['pointcloud', token],
    queryFn:  () => apiFetch<PointCloud>(`/sensor-data/${token}/pointcloud`),
    enabled:  !!token,
  })
}
