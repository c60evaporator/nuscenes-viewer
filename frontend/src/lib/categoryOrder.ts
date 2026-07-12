/**
 * カテゴリ表示順ユーティリティ
 * settings.yml annotation.category_order に基づきカテゴリ名を比較する。
 */
import { ANNOTATION } from '@/config/settings'

const orderMap = new Map(ANNOTATION.CATEGORY_ORDER.map((name, i) => [name, i]))

/**
 * category_order の記載順で比較する comparator。
 * 未掲載カテゴリは掲載分の後ろにアルファベット順で並ぶ。
 */
export function compareCategoryOrder(a: string, b: string): number {
  const ai = orderMap.get(a) ?? Infinity
  const bi = orderMap.get(b) ?? Infinity
  if (ai !== bi) return ai - bi
  return a.localeCompare(b)
}
