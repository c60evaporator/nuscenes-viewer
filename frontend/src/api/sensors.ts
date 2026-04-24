import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './client'
import type { CalibratedSensor } from '../types/sensor'
import type { PaginatedResponse } from '../types/common'

export function useCalibratedSensors(params?: { limit?: number }) {
  const limit = params?.limit ?? 20000
  return useQuery({
    queryKey:  ['calibrated-sensors', limit],
    queryFn:   () => apiFetch<PaginatedResponse<CalibratedSensor>>(`/calibrated-sensors?limit=${limit}`),
    staleTime: Infinity,
    gcTime:    Infinity,
  })
}
