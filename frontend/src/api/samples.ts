import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './client'
import type { Sample } from '../types/scene'
import type { SensorDataMap, InstanceSummary } from '../types/sensor'
import type { Annotation } from '../types/annotation'

// GET /scenes/{sceneToken}/samples でシーン配下のサンプル一覧を取得
// バックエンドに GET /samples 一覧エンドポイントは存在しないため scene 経由
export function useSamples(sceneToken: string | null) {
  return useQuery({
    queryKey: ['samples', sceneToken],
    queryFn:  () => apiFetch<Sample[]>(`/scenes/${sceneToken}/samples`),
    enabled:  !!sceneToken,
  })
}

export function useSample(token: string | null) {
  return useQuery({
    queryKey: ['sample', token],
    queryFn:  () => apiFetch<Sample>(`/samples/${token}`),
    enabled:  !!token,
  })
}

export function useSampleAnnotations(token: string | null) {
  return useQuery({
    queryKey: ['sample-annotations', token],
    queryFn:  () => apiFetch<Annotation[]>(`/samples/${token}/annotations`),
    enabled:  !!token,
  })
}

export function useSampleSensorData(token: string | null) {
  return useQuery({
    queryKey: ['sample-sensor-data', token],
    queryFn:  () => apiFetch<SensorDataMap>(`/samples/${token}/sensor-data`),
    enabled:  !!token,
  })
}

export function useSampleInstances(token: string | null) {
  return useQuery({
    queryKey: ['sample-instances', token],
    queryFn:  () => apiFetch<InstanceSummary[]>(`/samples/${token}/instances`),
    enabled:  !!token,
  })
}
