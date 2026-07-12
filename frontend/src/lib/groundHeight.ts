/**
 * LiDAR 点群からの地面高さ検出
 *
 * ヒストグラム＋中央値のロジックは notebooks/ground_height_detection.ipynb の
 * Python 検証実装と同一。ただしセンサー座標系⇔グローバル座標系の変換は、
 * notebook のスカラー加算（ground_z + sensor_height + ego_z）だと座標系間の傾き
 * （LiDAR 取り付け回転＋ego のピッチ/ロール）による誤差が target の距離に比例して
 * 乗るため、globalToSensor / sensorToGlobal による厳密な剛体変換を使う。
 *
 * Add BBox のデフォルト z 決定に使うほか、将来 3D Object Detection の予測 (x, y) に
 * 対する地面高さ推定にも使える独立モジュールとして保持する（UI・フック非依存）。
 */
import { ANNOTATION } from '@/config/settings'
import { globalToSensor, sensorToGlobal } from './coordinateUtils'

export interface GroundHeightParams {
  lowerMargin:     number    // prior より下に許容する範囲 (m)
  upperMargin:     number    // prior より上に許容する範囲 (m)
  searchRadii:     number[]  // targetXY からの検索半径 (m)。小さい順に走査
  binSize:         number    // ヒストグラムビン幅 (m)
  refineHalfWidth: number    // ビン中心から中央値算出に使う半幅 (m)
  minPoints:       number    // 有効とみなす最小点数
  maxDeviation:    number    // prior からの最大許容乖離 (m)
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
 * 指定位置周辺の地面高さ（センサー座標系 z）を推定する。
 *
 * @param points   LiDAR センサー座標系の点群 [x, y, z, ...]
 * @param targetXY 地面高さを求めたい水平位置（センサー座標系）
 * @param priorZ   その位置で予測される地面のセンサー座標 z。
 *                 zフィルタ窓 [priorZ - lowerMargin, priorZ + upperMargin] の中心および
 *                 maxDeviation 判定の基準に使う（ego 直下では -LiDAR取り付け高さ にほぼ一致）
 * @returns センサー座標系の地面 z。全半径で条件を満たさなければ null
 */
export function estimateGroundZ(
  points:   number[][],
  targetXY: [number, number],
  priorZ:   number,
  params:   GroundHeightParams = DEFAULT_GROUND_HEIGHT_PARAMS,
): number | null {
  const zMin = priorZ - params.lowerMargin
  const zMax = priorZ + params.upperMargin
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

  // (zMax - zMin) / binSize が浮動小数点誤差で僅かに整数を超えたときに
  // 余分なビンを作らないよう epsilon を引いてから切り上げる
  const binCount = Math.max(1, Math.ceil((zMax - zMin) / params.binSize - 1e-9))

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

    // prior からの乖離妥当性チェック
    if (Math.abs(groundZ - priorZ) > params.maxDeviation) continue

    return groundZ
  }

  return null
}

/**
 * グローバル座標系の (x, y) に対する地面高さ推定。
 *
 * グローバル (x, y, egoZ)（= ego と同じ高さの地面点）を globalToSensor で厳密変換し、
 * その z を prior としてセンサー座標系で検出。検出値は sensorToGlobal で厳密に
 * グローバル座標へ戻すため、座標系間に傾きがあっても target の距離に依らず正確。
 *
 * @param points           LiDAR センサー座標系の点群 [x, y, z, ...]
 * @param targetGlobalXY   地面高さを求めたい水平位置（グローバル座標系）
 * @param egoPose          点群フレームの ego pose（LIDAR_TOP の ego_pose を推奨）
 * @param lidarCalibSensor LIDAR_TOP の calibrated sensor
 * @returns グローバル座標系の地面高さ。検出できなければ egoZ を返す
 */
export function estimateGroundZGlobal(
  points:           number[][],
  targetGlobalXY:   [number, number],
  egoPose:          { translation: number[]; rotation: number[] },
  lidarCalibSensor: { translation: number[]; rotation: number[] },
  params:           GroundHeightParams = DEFAULT_GROUND_HEIGHT_PARAMS,
): number {
  const egoZ = egoPose.translation[2]
  const sensorPt = globalToSensor(
    [targetGlobalXY[0], targetGlobalXY[1], egoZ],
    egoPose,
    lidarCalibSensor,
  )
  const zSensor = estimateGroundZ(
    points,
    [sensorPt[0], sensorPt[1]],
    sensorPt[2],  // 傾き補正済み prior
    params,
  )
  if (zSensor === null) return egoZ
  return sensorToGlobal([sensorPt[0], sensorPt[1], zSensor], egoPose, lidarCalibSensor)[2]
}

/** 中央値（偶数個は中央2点の平均、np.median 準拠） */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}
