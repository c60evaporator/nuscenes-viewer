import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './client'
import type { Instance, InstanceAnnotation } from '../types/annotation'
import type { PaginatedResponse } from '../types/common'
import type { BestCamera } from '../types/map'

export function useInstances(params?: {
  sceneToken?:   string
  categoryName?: string
  limit?:        number
  offset?:       number
}) {
  const limit  = params?.limit  ?? 50
  const offset = params?.offset ?? 0
  const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) })
  if (params?.sceneToken)   qs.set('scene_token',   params.sceneToken)
  if (params?.categoryName) qs.set('category_name', params.categoryName)
  return useQuery({
    queryKey: ['instances', params],
    queryFn:  () => apiFetch<PaginatedResponse<Instance>>(`/instances/?${qs}`),
  })
}

export function useInstance(token: string | null) {
  return useQuery({
    queryKey: ['instance', token],
    queryFn:  () => apiFetch<Instance>(`/instances/${token}`),
    enabled:  !!token,
  })
}

export function useInstanceAnnotations(token: string | null) {
  return useQuery({
    queryKey: ['instance-annotations', token],
    queryFn:  () => apiFetch<InstanceAnnotation[]>(`/instances/${token}/annotations`),
    enabled:  !!token,
  })
}

export function useInstanceBestCamera(token: string | null, sampleToken: string | null) {
  return useQuery({
    queryKey: ['instance-best-camera', token, sampleToken],
    queryFn:  () =>
      apiFetch<BestCamera>(`/instances/${token}/best-camera?sample_token=${sampleToken}`),
    enabled: !!token && !!sampleToken,
  })
}
