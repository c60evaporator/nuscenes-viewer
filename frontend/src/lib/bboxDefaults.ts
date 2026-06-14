import { ANNOTATION } from '@/config/settings'

// カテゴリ名からデフォルトサイズを階層的に解決する（vehicle.emergency.ambulance → vehicle.emergency → vehicle の順）
export function resolveDefaultSize(categoryName: string): [number, number, number] | null {
  const sizes = ANNOTATION.DEFAULT_BBOX_SIZES
  let name = categoryName
  while (name.length > 0) {
    if (name in sizes) return sizes[name]
    const lastDot = name.lastIndexOf('.')
    if (lastDot === -1) break
    name = name.slice(0, lastDot)
  }
  return null
}
