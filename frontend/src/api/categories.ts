import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './client'
import type { Category } from '../types/annotation'

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn:  () => apiFetch<Category[]>('/categories'),
    staleTime: Infinity,   // カテゴリは変化しないため無期限キャッシュ
  })
}
