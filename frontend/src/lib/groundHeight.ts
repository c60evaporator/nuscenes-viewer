/**
 * LiDAR 点群からの地面高さ検出
 *
 * notebooks/ground_height_detection.ipynb の Python 検証実装と同一ロジック。
 * Add BBox のデフォルト z 決定に使うほか、将来 3D Object Detection の予測 (x, y) に
 * 対する地面高さ推定にも使える独立モジュールとして保持する（UI・フック非依存）。
 */
import { ANNOTATION } from '@/config/settings'
import { globalToSensor } from './coordinateUtils'

export interface GroundHeightParams {
  lowerMargin:     number    // -LiDAR高さより下に許容する範囲 (m)
  upperMargin:     number    // -LiDAR高さより上に許容する範囲 (m)
  searchRadii:     number[]  // targetXY からの検索半径 (m)。小さい順に走査
  binSize:         number    // ヒストグラムビン幅 (m)
  refineHalfWidth: number    // ビン中心から中央値算出に使う半幅 (m)
  minPoints:       number    // 有効とみなす最小点数
  maxDeviation:    number    // prior (-LiDAR高さ) からの最大許容乖離 (m)
}

/** settings.yml annotation.ground_height_detection のデフォルトパラメータ */
export const DEFAULT_GROUND_HEIGHT_PARAMS: GroundHeightParams = {
  lowerMargin:     ANNOTATION.GROUND_HEIGHT_DETECTION.lower_margin,
  upperMargin:     ANNOTATION.GROUND_HEIGHT_DETECTION.upper_margin,
  searchRadii:     ANNOTATION.GROUND_HEIGHT_DETECTION.search_radii,
  binSize:         ANNOTATION.GROUND_HEIGHT_DETECTION.bin_size,
  refineHalfWidth: ANNOTATION.GROUND_HEIGHT_DETECTION.refine_half_width,
  minPoints:       ANNOTATION.GROUND_HEIGHT_DETECTION.min_points,
  maxDeviation:    ANNOTATION.GROUND_HEIGHT_DETECTION.max_deviation,
}

/**
 * 指定位置周辺の地面高さ（グローバル座標系 z）を推定する。
 *
 * @param points       LiDAR センサー座標系の点群 [x, y, z, ...]
 * @param targetXY     地面高さを求めたい水平位置（センサー座標系）
 * @param sensorHeight LiDAR の取り付け高さ = calibrated_sensor.translation[2] (m)
 * @param egoZ         自車の高さ = ego_pose.translation[2] (m)
 * @returns グローバル座標系の地面高さ。全半径で条件を満たさなければ egoZ を返す
 */
export function estimateGroundZ(
  points:       number[][],
  targetXY:     [number, number],
  sensorHeight: number,
  egoZ:         number,
  params:       GroundHeightParams = DEFAULT_GROUND_HEIGHT_PARAMS,
): number {
  const zMin = -sensorHeight - params.lowerMargin
  const zMax = -sensorHeight + params.upperMargin
  const [tx, ty] = targetXY

  // 事前 z フィルタ（全半径で共通）と targetXY からの2D距離²
  const zs:    number[] = []
  const dist2: number[] = []
  for (const p of points) {
    const z = p[2]
    if (z < zMin || z > zMax) continue
    const dx = p[0] - tx
    const dy = p[1] - ty
    zs.push(z)
    dist2.push(dx * dx + dy * dy)
  }

  const binCount = Math.ceil((zMax - zMin) / params.binSize)

  for (const radius of params.searchRadii) {
    const r2 = radius * radius
    const zsInRadius: number[] = []
    for (let i = 0; i < zs.length; i++) {
      if (dist2[i] <= r2) zsInRadius.push(zs[i])
    }

    // ヒストグラム化し、点数最大のビンを選択（同数タイは低い方）
    const bins = new Array<number>(binCount).fill(0)
    for (const z of zsInRadius) {
      const idx = Math.min(binCount - 1, Math.floor((z - zMin) / params.binSize))
      bins[idx]++
    }
    let groundBinIdx = 0
    for (let i = 1; i < binCount; i++) {
      if (bins[i] > bins[groundBinIdx]) groundBinIdx = i
    }

    // ビン中心 ± refineHalfWidth の点の中央値で精密化
    const binCenter = zMin + (groundBinIdx + 0.5) * params.binSize
    const refined = zsInRadius.filter((z) => Math.abs(z - binCenter) <= params.refineHalfWidth)
    if (refined.length < params.minPoints) continue  // 半径を拡大して再試行

    const groundZ = median(refined)

    // prior (-sensorHeight) からの乖離妥当性チェック
    if (Math.abs(groundZ - -sensorHeight) > params.maxDeviation) continue

    // センサー座標系 → グローバル座標系
    return groundZ + sensorHeight + egoZ
  }

  return egoZ
}

/**
 * グローバル座標系の (x, y) に対する地面高さ推定。
 * targetXY を LiDAR センサー座標系に変換して estimateGroundZ を呼ぶ。
 *
 * @param points           LiDAR センサー座標系の点群 [x, y, z, ...]
 * @param targetGlobalXY   地面高さを求めたい水平位置（グローバル座標系）
 * @param egoPose          点群フレームの ego pose（LIDAR_TOP の ego_pose を推奨）
 * @param lidarCalibSensor LIDAR_TOP の calibrated sensor
 */
export function estimateGroundZGlobal(
  points:           number[][],
  targetGlobalXY:   [number, number],
  egoPose:          { translation: number[]; rotation: number[] },
  lidarCalibSensor: { translation: number[]; rotation: number[] },
  params:           GroundHeightParams = DEFAULT_GROUND_HEIGHT_PARAMS,
): number {
  const sensorPt = globalToSensor(
    [targetGlobalXY[0], targetGlobalXY[1], egoPose.translation[2]],
    egoPose,
    lidarCalibSensor,
  )
  return estimateGroundZ(
    points,
    [sensorPt[0], sensorPt[1]],
    lidarCalibSensor.translation[2],
    egoPose.translation[2],
    params,
  )
}

/** 中央値（偶数個は中央2点の平均、np.median 準拠） */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}
