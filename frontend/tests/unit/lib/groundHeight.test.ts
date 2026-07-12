import { describe, it, expect } from 'vitest'
import {
  DEFAULT_GROUND_HEIGHT_PARAMS,
  estimateGroundZ,
  estimateGroundZGlobal,
} from '@/lib/groundHeight'

// settings.yml: lower_margin=1.0, upper_margin=1.0, search_radii=[3,5,7],
//               bin_size=0.1, refine_half_width=0.15, min_points=20, max_deviation=1.0
const SENSOR_HEIGHT = 1.84
const EGO_Z = 1.0

/** (cx, cy) 周辺に z 一定の点群を n 点生成する（x 方向に 0.05m 間隔で並べる） */
function flatPoints(n: number, z: number, cx = 0, cy = 0): number[][] {
  return Array.from({ length: n }, (_, i) => [cx + i * 0.05, cy, z, 0])
}

describe('estimateGroundZ', () => {
  it('平坦な地面（センサー座標 z=-2.0）→ グローバル z = -2.0 + sensorHeight + egoZ', () => {
    const points = flatPoints(30, -2.0)
    const gz = estimateGroundZ(points, [0, 0], SENSOR_HEIGHT, EGO_Z)
    expect(gz).toBeCloseTo(-2.0 + SENSOR_HEIGHT + EGO_Z)  // 0.84
  })

  it('最小半径で min_points 不足 → 次の半径で成功', () => {
    const points = [
      ...flatPoints(10, -2.0, 0, 0),   // 半径3m以内: 10点（不足）
      ...flatPoints(20, -2.0, 4, 0),   // 距離4m: 半径5mで加わる
    ]
    const gz = estimateGroundZ(points, [0, 0], SENSOR_HEIGHT, EGO_Z)
    expect(gz).toBeCloseTo(0.84)
  })

  it('max_deviation 超過 → 全半径で不成立となり egoZ を返す', () => {
    const points = flatPoints(100, -2.0)  // prior(-1.84) から 0.16 乖離
    const gz = estimateGroundZ(points, [0, 0], SENSOR_HEIGHT, EGO_Z, {
      ...DEFAULT_GROUND_HEIGHT_PARAMS,
      maxDeviation: 0.1,
    })
    expect(gz).toBe(EGO_Z)
  })

  it('点群が空 → egoZ を返す', () => {
    expect(estimateGroundZ([], [0, 0], SENSOR_HEIGHT, EGO_Z)).toBe(EGO_Z)
  })

  it('zフィルタ範囲外の点のみ → egoZ を返す', () => {
    const points = flatPoints(100, 0.5)  // zMax = -0.84 より上
    expect(estimateGroundZ(points, [0, 0], SENSOR_HEIGHT, EGO_Z)).toBe(EGO_Z)
  })

  it('検索半径内に点がない（遠方のみ）→ egoZ を返す', () => {
    const points = flatPoints(100, -2.0, 50, 50)  // 最大半径7mの外
    expect(estimateGroundZ(points, [0, 0], SENSOR_HEIGHT, EGO_Z)).toBe(EGO_Z)
  })

  it('バイモーダル分布 → 点数最大のビン（地面）を選択', () => {
    const points = [
      ...flatPoints(100, -2.0),  // 地面
      ...flatPoints(30, -1.0),   // 車のルーフ等（z範囲内だが少数）
    ]
    const gz = estimateGroundZ(points, [0, 0], SENSOR_HEIGHT, EGO_Z)
    expect(gz).toBeCloseTo(0.84)
  })

  it('偶数個の中央値は中央2点の平均（ビン同数タイは低い方を選択）', () => {
    // -2.0 と -1.9 が各10点。ビンは同数タイ → 低い方のビン(中心-1.99)を選択し、
    // ±0.15 の精密化窓に両クラスタが入る → median = -1.95
    const points = [
      ...flatPoints(10, -2.0),
      ...flatPoints(10, -1.9),
    ]
    const gz = estimateGroundZ(points, [0, 0], SENSOR_HEIGHT, EGO_Z)
    expect(gz).toBeCloseTo(-1.95 + SENSOR_HEIGHT + EGO_Z)
  })
})

describe('estimateGroundZGlobal', () => {
  it('グローバル (x, y) をセンサー座標に変換して推定する', () => {
    const egoPose = { translation: [100, 200, EGO_Z], rotation: [1, 0, 0, 0] }
    const calib   = { translation: [0, 0, SENSOR_HEIGHT], rotation: [1, 0, 0, 0] }
    // グローバル (105, 200) はセンサー座標 (5, 0) に対応
    const points = flatPoints(30, -2.0, 5, 0)
    const gz = estimateGroundZGlobal(points, [105, 200], egoPose, calib)
    expect(gz).toBeCloseTo(0.84)
  })

  it('対象位置に点群がなければ egoZ を返す', () => {
    const egoPose = { translation: [100, 200, EGO_Z], rotation: [1, 0, 0, 0] }
    const calib   = { translation: [0, 0, SENSOR_HEIGHT], rotation: [1, 0, 0, 0] }
    const gz = estimateGroundZGlobal([], [105, 200], egoPose, calib)
    expect(gz).toBe(EGO_Z)
  })
})
