import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './client'
import type { Scene, Sample, SceneListResponse } from '../types/scene'
import type { EgoPosePoint } from '../types/sensor'

export function useScenes(params?: { limit?: number; offset?: number }) {
  const limit  = params?.limit  ?? 50
  const offset = params?.offset ?? 0
  return useQuery({
    queryKey: ['scenes', limit, offset],
    queryFn:  () => apiFetch<SceneListResponse>(`/scenes?limit=${limit}&offset=${offset}`),
  })
}

export function useScene(token: string | null) {
  return useQuery({
    queryKey: ['scene', token],
    queryFn:  () => apiFetch<Scene>(`/scenes/${token}`),
    enabled:  !!token,
  })
}

export function useSceneSamples(token: string | null) {
  return useQuery({
    queryKey: ['scene-samples', token],
    queryFn:  () => apiFetch<Sample[]>(`/scenes/${token}/samples`),
    enabled:  !!token,
  })
}

export function useSceneEgoPoses(token: string | null) {
  return useQuery({
    queryKey: ['scene-ego-poses', token],
    queryFn:  () => apiFetch<EgoPosePoint[]>(`/scenes/${token}/ego-poses`),
    enabled:  !!token,
  })
}
