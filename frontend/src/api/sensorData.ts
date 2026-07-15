import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './client'
import type { PointCloud } from '../types/sensor'

/**
 * センサー画像を ImageBitmap として取得する。
 * maxSize 指定時は長辺が maxSize 以下に縮小された画像を取得する（動画生成用・aws環境では無効）
 */
export async function fetchSensorImageBitmap(token: string, maxSize?: number): Promise<ImageBitmap> {
  const params = maxSize ? `?max_size=${maxSize}` : ''
  const res = await fetch(`/api/v1/sensor-data/${token}/image${params}`)
  if (!res.ok) throw new Error('image fetch failed')

  // AWS mode: response is {"url": "..."} → fetch from CloudFront
  if ((res.headers.get('content-type') ?? '').includes('application/json')) {
    const { url } = await res.json() as { url: string }
    const encodedUrl = url.replace(/\+/g, '%2B')  // CloudFront 経由で '+' がスペースとして解釈される問題への対処
    const imgRes = await fetch(encodedUrl)  // mode: 'cors'不要
    if (!imgRes.ok) throw new Error('CloudFront image fetch failed')
    return createImageBitmap(await imgRes.blob())
  }

  // Local mode: binary image stream
  return createImageBitmap(await res.blob())
}

export function useSensorImage(token: string | null) {
  return useQuery({
    queryKey: ['sensor-image', token],
    queryFn:   () => fetchSensorImageBitmap(token!),
    enabled:   !!token,
    staleTime: Infinity,
    gcTime:    Infinity,
  })
}

/**
 * 動画生成用の縮小画像 queryOptions。
 * 表示用フル解像度キャッシュ（['sensor-image', token]）とはキーを分離し、gcTime を短めにする
 */
export function videoSensorImageQueryOptions(token: string, maxSize: number) {
  return {
    queryKey:  ['sensor-image-video', token, maxSize] as const,
    queryFn:   () => fetchSensorImageBitmap(token, maxSize),
    staleTime: Infinity,
    gcTime:    5 * 60 * 1000,
  }
}

/** 点群の queryOptions（usePointCloud と動画生成プリフェッチでキャッシュキーを共有する） */
export function pointCloudQueryOptions(token: string, refSensorToken?: string | null) {
  return {
    queryKey: ['pointcloud', token, refSensorToken ?? null] as const,
    queryFn: () => {
      const params = refSensorToken ? `?ref_sensor_token=${refSensorToken}` : ''
      return apiFetch<PointCloud>(`/sensor-data/${token}/pointcloud${params}`)
    },
    staleTime: Infinity,
    gcTime:    30 * 60 * 1000,
  }
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
    ...pointCloudQueryOptions(token ?? '', refSensorToken),
    enabled: !!token,
  })
}
