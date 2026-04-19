import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './client'
import type { PointCloud } from '../types/sensor'

export function useSensorImage(token: string | null) {
  return useQuery({
    queryKey: ['sensor-image', token],
    queryFn: async () => {
      const res = await fetch(`/api/v1/sensor-data/${token}/image`)
      if (!res.ok) throw new Error('image fetch failed')
      const blob = await res.blob()
      return createImageBitmap(blob)
    },
    enabled:   !!token,
    staleTime: Infinity,
    gcTime:    Infinity,
  })
}

export function useSensorDataEgoPose(token: string | null) {
  return useQuery({
    queryKey: ['sensor-data-ego-pose', token],
    queryFn: () =>
      apiFetch<{ translation: number[]; rotation: number[] }>(`/sensor-data/${token}/ego-pose`),
    enabled:   !!token,
    staleTime: Infinity,
  })
}

export function usePointCloud(token: string | null, refSensorToken?: string | null) {
  return useQuery({
    queryKey: ['pointcloud', token, refSensorToken ?? null],
    queryFn: () => {
      const params = refSensorToken ? `?ref_sensor_token=${refSensorToken}` : ''
      return apiFetch<PointCloud>(`/sensor-data/${token}/pointcloud${params}`)
    },
    enabled: !!token,
  })
}
