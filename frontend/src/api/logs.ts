import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './client'
import type { Log, LogListResponse } from '../types/scene'

export function useLogs(params?: { limit?: number; offset?: number }) {
  const limit  = params?.limit  ?? 100
  const offset = params?.offset ?? 0
  return useQuery({
    queryKey: ['logs', limit, offset],
    queryFn:  () => apiFetch<LogListResponse>(`/logs?limit=${limit}&offset=${offset}`),
  })
}

// 特定 location に紐づく Log 一覧（全件取得してフロントでフィルタ）
export function useLogsByLocation(location: string | null) {
  return useQuery({
    queryKey: ['logs-by-location', location],
    queryFn:  async () => {
      const res = await apiFetch<LogListResponse>('/logs?limit=500&offset=0')
      return res.items.filter((log: Log) => log.location === location)
    },
    enabled: !!location,
  })
}
