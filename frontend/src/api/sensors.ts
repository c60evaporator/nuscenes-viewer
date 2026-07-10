import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './client'
import type { CalibratedSensor, Sensor } from '../types/sensor'
import type { PaginatedResponse } from '../types/common'

export function useSensors(params?: { limit?: number }) {
  const limit = params?.limit ?? 500   // /sensors は le=500（センサは全12件）
  return useQuery({
    queryKey:  ['sensors', limit],
    queryFn:   () => apiFetch<PaginatedResponse<Sensor>>(`/sensors?limit=${limit}`),
    staleTime: Infinity,
    gcTime:    Infinity,
  })
}

export function useCalibratedSensors(params?: { limit?: number }) {
  const limit = params?.limit ?? 20000
  return useQuery({
    queryKey:  ['calibrated-sensors', limit],
    queryFn:   () => apiFetch<PaginatedResponse<CalibratedSensor>>(`/calibrated-sensors?limit=${limit}`),
    staleTime: Infinity,
    gcTime:    Infinity,
  })
}
