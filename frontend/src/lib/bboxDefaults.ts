import { ANNOTATION } from '@/config/settings'
import type { InstanceAnnotation } from '@/types/annotation'

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

/** Add BBox モードのデフォルト値（translation / size / rotation） */
export interface BBoxDefault {
  translation: number[]
  size:        number[]
  rotation:    number[]
}

/**
 * クォータニオン [w, x, y, z] から yaw 成分のみを抽出し、
 * z軸回転クォータニオン [cos(yaw/2), 0, 0, sin(yaw/2)] を返す
 */
export function extractYawQuaternion(q: number[]): number[] {
  const yaw = extractYaw(q)
  return [Math.cos(yaw / 2), 0, 0, Math.sin(yaw / 2)]
}

/** クォータニオン [w, x, y, z] から yaw（ラジアン）を抽出する */
function extractYaw(q: number[]): number {
  const [w, x, y, z] = q
  return Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))
}

/**
 * 同一 Instance のアノテーションがない場合のデフォルト値。
 * ego の yaw 方向に default_forward_distance 前方、底面が地面高さに一致する位置に置く。
 *
 * @param getGroundZ 指定 (x, y)（グローバル座標系）の地面高さを返す関数
 *                   （lib/groundHeight.ts の点群ベース検出を想定）。
 *                   未指定（点群なし等）の場合は egoZ を地面高さとして使う
 */
export function computeEgoBasedDefault(
  egoPose:     { translation: number[]; rotation: number[] },
  size:        number[],
  getGroundZ?: (x: number, y: number) => number,
): { translation: number[]; rotation: number[] } {
  const yaw = extractYaw(egoPose.rotation)
  const x = egoPose.translation[0] + ANNOTATION.DEFAULT_FORWARD_DISTANCE * Math.cos(yaw)
  const y = egoPose.translation[1] + ANNOTATION.DEFAULT_FORWARD_DISTANCE * Math.sin(yaw)
  const groundZ = getGroundZ ? getGroundZ(x, y) : egoPose.translation[2]
  const z = groundZ + size[2] / 2
  return {
    translation: [x, y, z],
    rotation:    [Math.cos(yaw / 2), 0, 0, Math.sin(yaw / 2)],
  }
}

/**
 * 同一 Instance の既存アノテーションから優先度1〜5でデフォルト値を求める。
 * t0 = 追加先 Sample の timestamp（マイクロ秒）。アノテーションがなければ null。
 *
 * - 優先度1（内挿）: 前後に1個以上ずつ → translation を線形内挿、size/rotation は時間的に近い方
 * - 優先度2（外挿）: 前に2個以上 → 直前2点から線形外挿（時間ギャップ上限あり）
 * - 優先度3（外挿）: 後に2個以上 → 直後2点から線形外挿（同上）
 * - 優先度4/5: 前 or 後に1個のみ → そのままコピー
 */
export function computeInstanceBasedDefault(
  anns: InstanceAnnotation[],
  t0:   number,
): BBoxDefault | null {
  const sorted = [...anns].sort((a, b) => a.timestamp - b.timestamp)
  const before = sorted.filter((a) => a.timestamp < t0)
  const after  = sorted.filter((a) => a.timestamp > t0)

  // 優先度1: 内挿
  if (before.length >= 1 && after.length >= 1) {
    const b1 = before[before.length - 1]
    const a1 = after[0]
    const translation = interpolateTranslation(b1, a1, t0)
    // 時間的に近い方の size/rotation を採用（同距離なら before 側）
    const nearer = t0 - b1.timestamp <= a1.timestamp - t0 ? b1 : a1
    return { translation, size: [...nearer.size], rotation: [...nearer.rotation] }
  }

  // 優先度2: 前2点から外挿
  if (before.length >= 2) {
    const b1 = before[before.length - 1]
    const b2 = before[before.length - 2]
    return { translation: extrapolateTranslation(b1, b2, t0), size: [...b1.size], rotation: [...b1.rotation] }
  }

  // 優先度3: 後2点から外挿
  if (after.length >= 2) {
    const a1 = after[0]
    const a2 = after[1]
    return { translation: extrapolateTranslation(a1, a2, t0), size: [...a1.size], rotation: [...a1.rotation] }
  }

  // 優先度4/5: 1点のみ → コピー
  const only = before[0] ?? after[0]
  if (only) {
    return { translation: [...only.translation], size: [...only.size], rotation: [...only.rotation] }
  }

  return null
}

/** t1 + (t2 - t1) * (T0 - T1) / (T2 - T1)（T1 == T2 なら t1） */
function interpolateTranslation(
  ann1: InstanceAnnotation,
  ann2: InstanceAnnotation,
  t0:   number,
): number[] {
  if (ann2.timestamp === ann1.timestamp) return [...ann1.translation]
  const f = (t0 - ann1.timestamp) / (ann2.timestamp - ann1.timestamp)
  return ann1.translation.map((v, i) => v + (ann2.translation[i] - v) * f)
}

/** 外挿版: |T0 - T1| が translation_extrapolation_max（秒）を超えたら外挿せず t1 を返す */
function extrapolateTranslation(
  ann1: InstanceAnnotation,
  ann2: InstanceAnnotation,
  t0:   number,
): number[] {
  const maxGapUs = ANNOTATION.TRANSLATION_EXTRAPOLATION_MAX * 1e6
  if (Math.abs(t0 - ann1.timestamp) > maxGapUs) return [...ann1.translation]
  return interpolateTranslation(ann1, ann2, t0)
}
