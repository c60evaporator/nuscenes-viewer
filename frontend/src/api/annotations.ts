import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from './client'
import type { Annotation, Attribute, Visibility } from '../types/annotation'
import type { PaginatedResponse } from '../types/common'

export function useAnnotations(params?: { limit?: number; offset?: number }) {
  const limit  = params?.limit  ?? 50
  const offset = params?.offset ?? 0
  return useQuery({
    queryKey: ['annotations', limit, offset],
    queryFn:  () =>
      apiFetch<PaginatedResponse<Annotation>>(`/annotations?limit=${limit}&offset=${offset}`),
  })
}

export function useAnnotation(token: string | null) {
  return useQuery({
    queryKey: ['annotation', token],
    queryFn:  () => apiFetch<Annotation>(`/annotations/${token}`),
    enabled:  !!token,
  })
}

export function useVisibilities() {
  return useQuery({
    queryKey: ['visibilities'],
    queryFn:  () => apiFetch<Visibility[]>('/visibilities'),
    staleTime: Infinity,
  })
}

export function useAttributes() {
  return useQuery({
    queryKey: ['attributes'],
    queryFn:  () => apiFetch<Attribute[]>('/attributes'),
    staleTime: Infinity,
  })
}

// PATCH /annotations/{token} — アノテーション部分更新
export interface UpdateAnnotationBody {
  translation?:      number[]
  rotation?:         number[]
  size?:             number[]
  visibility_token?: string | null
  attribute_tokens?: string[]
  version?:          number | null   // 楽観的ロック用
}

export function useUpdateAnnotation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ token, body }: { token: string; body: UpdateAnnotationBody }) =>
      apiFetch<Annotation>(`/annotations/${token}`, {
        method: 'PATCH',
        body:   JSON.stringify(body),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['annotation', data.token] })
      queryClient.invalidateQueries({ queryKey: ['annotations'] })
      queryClient.invalidateQueries({ queryKey: ['sample-annotations', data.sample_token] })
      queryClient.invalidateQueries({ queryKey: ['instance-annotations', data.instance_token] })
      queryClient.invalidateQueries({ queryKey: ['sample-instances', data.sample_token] })
    },
  })
}

// POST /annotations — 新規 BBox 追加
export interface CreateAnnotationBody {
  sample_token:      string
  instance_token?:   string | null
  new_instance?:     { category_token: string } | null
  translation:       number[]
  rotation:          number[]
  size:              number[]
  prev?:             string | null
  next?:             string | null
  visibility_token?: string | null
  attribute_tokens?: string[]
}

export function useCreateAnnotation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateAnnotationBody) =>
      apiFetch<Annotation>('/annotations', {
        method: 'POST',
        body:   JSON.stringify(body),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['annotations'] })
      queryClient.invalidateQueries({ queryKey: ['sample-annotations', data.sample_token] })
      queryClient.invalidateQueries({ queryKey: ['instance-annotations', data.instance_token] })
      queryClient.invalidateQueries({ queryKey: ['sample-instances', data.sample_token] })
      queryClient.invalidateQueries({ queryKey: ['instances'] })
    },
  })
}
