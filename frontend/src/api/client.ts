// baseURLとエラーハンドリングを一元化
const BASE_URL = import.meta.env.VITE_API_BASE_PATH ?? '/api/v1'

export class ApiError extends Error {
  status: number
  detail: unknown
  constructor(status: number, detail: unknown, message: string) {
    super(message)
    this.name   = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    const detailStr = typeof err.detail === 'string'
      ? err.detail
      : JSON.stringify(err.detail)
    throw new ApiError(res.status, err.detail, detailStr ?? 'API error')
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}
