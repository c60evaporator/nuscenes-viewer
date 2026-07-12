import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from './client'
import type { Scene, Sample, SceneListResponse } from '../types/scene'
import type { SceneDeleteResult } from '../types/sceneDelete'
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

/** ユーザ追加 scene を関連レコードごと削除する（DELETE /scenes/{token}） */
export function useDeleteScene() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (token: string) =>
      apiFetch<SceneDeleteResult>(`/scenes/${token}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scenes'] })
    },
  })
}

/** 複数シーンの Ego-poses を並列取得し、シーンごとのグループ配列で返す */
export function useAllScenesEgoPoses(sceneTokens: string[]) {
  const results = useQueries({
    queries: sceneTokens.map((token) => ({
      queryKey:  ['scene-ego-poses', token],
      queryFn:   () => apiFetch<EgoPosePoint[]>(`/scenes/${token}/ego-poses`),
      staleTime: Infinity,
    })),
  })
  const groups = results
    .map((r) => r.data)
    .filter((d): d is EgoPosePoint[] => d !== undefined)
  const isLoading = results.some((r) => r.isLoading)
  return { data: groups, isLoading }
}
