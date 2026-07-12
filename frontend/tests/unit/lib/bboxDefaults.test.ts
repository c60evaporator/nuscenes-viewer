import { describe, it, expect } from 'vitest'
import {
  computeEgoBasedDefault,
  computeInstanceBasedDefault,
  extractYawQuaternion,
} from '@/lib/bboxDefaults'
import { eulerDegToQuaternion } from '@/lib/coordinateUtils'
import { ANNOTATION } from '@/config/settings'
import type { InstanceAnnotation } from '@/types/annotation'

// timestamp はマイクロ秒
const SEC = 1e6

function ann(
  timestamp:   number,
  translation: number[],
  size:        number[] = [1, 2, 3],
  rotation:    number[] = [1, 0, 0, 0],
): InstanceAnnotation {
  return {
    token:            `token-${timestamp}`,
    sample_token:     `sample-${timestamp}`,
    instance_token:   'inst',
    translation,
    rotation,
    size,
    prev:             null,
    next:             null,
    num_lidar_pts:    0,
    num_radar_pts:    0,
    visibility_token: null,
    category_token:   'cat',
    attributes:       [],
    visibility:       null,
    timestamp,
  }
}

describe('computeInstanceBasedDefault', () => {
  it('優先度1: 前後に1個以上ずつ → translation を線形内挿', () => {
    const before = ann(0,       [0, 0, 0],    [1, 1, 1], [1, 0, 0, 0])
    const after  = ann(1 * SEC, [10, 20, 2],  [2, 2, 2], [0, 0, 0, 1])
    const d = computeInstanceBasedDefault([after, before], 0.25 * SEC)
    expect(d).not.toBeNull()
    expect(d!.translation[0]).toBeCloseTo(2.5)
    expect(d!.translation[1]).toBeCloseTo(5)
    expect(d!.translation[2]).toBeCloseTo(0.5)
    // 時間的に近い方（before）の size / rotation
    expect(d!.size).toEqual([1, 1, 1])
    expect(d!.rotation).toEqual([1, 0, 0, 0])
  })

  it('優先度1: 後ろの方が近ければ後ろの size / rotation、同距離なら前を採用', () => {
    const before = ann(0,       [0, 0, 0],  [1, 1, 1], [1, 0, 0, 0])
    const after  = ann(1 * SEC, [10, 0, 0], [2, 2, 2], [0, 0, 0, 1])
    const nearAfter = computeInstanceBasedDefault([before, after], 0.75 * SEC)
    expect(nearAfter!.size).toEqual([2, 2, 2])
    expect(nearAfter!.rotation).toEqual([0, 0, 0, 1])
    const tie = computeInstanceBasedDefault([before, after], 0.5 * SEC)
    expect(tie!.size).toEqual([1, 1, 1])
  })

  it('優先度2: 前に2個以上 → 直前2点から線形外挿、size/rotation は最寄り', () => {
    const b2 = ann(0,         [0, 0, 0], [1, 1, 1], [1, 0, 0, 0])
    const b1 = ann(0.5 * SEC, [5, 0, 0], [2, 2, 2], [0, 0, 0, 1])
    const d = computeInstanceBasedDefault([b2, b1], 1 * SEC)
    expect(d!.translation[0]).toBeCloseTo(10)
    expect(d!.size).toEqual([2, 2, 2])
    expect(d!.rotation).toEqual([0, 0, 0, 1])
  })

  it('優先度2: |T0-T1| が translation_extrapolation_max 超過なら外挿せず t1 を使用', () => {
    const b2 = ann(0,         [0, 0, 0])
    const b1 = ann(0.5 * SEC, [5, 0, 0])
    const t0 = 0.5 * SEC + (ANNOTATION.TRANSLATION_EXTRAPOLATION_MAX + 0.1) * SEC
    const d = computeInstanceBasedDefault([b2, b1], t0)
    expect(d!.translation).toEqual([5, 0, 0])
  })

  it('優先度3: 後に2個以上 → 直後2点から線形外挿', () => {
    const a1 = ann(1 * SEC,   [10, 0, 0], [2, 2, 2], [0, 0, 0, 1])
    const a2 = ann(1.5 * SEC, [15, 0, 0], [3, 3, 3], [0, 1, 0, 0])
    const d = computeInstanceBasedDefault([a2, a1], 0.5 * SEC)
    expect(d!.translation[0]).toBeCloseTo(5)
    expect(d!.size).toEqual([2, 2, 2])
    expect(d!.rotation).toEqual([0, 0, 0, 1])
  })

  it('優先度4/5: 前 or 後に1個のみ → そのままコピー', () => {
    const single = ann(0, [1, 2, 3], [4, 5, 6], [0, 0, 1, 0])
    const before = computeInstanceBasedDefault([single], 1 * SEC)
    expect(before).toEqual({ translation: [1, 2, 3], size: [4, 5, 6], rotation: [0, 0, 1, 0] })
    const after = computeInstanceBasedDefault([single], -1 * SEC)
    expect(after).toEqual({ translation: [1, 2, 3], size: [4, 5, 6], rotation: [0, 0, 1, 0] })
  })

  it('T1 == T2 のときは補間せず t1 を使用', () => {
    const b2 = ann(0, [0, 0, 0])
    const b1 = ann(0, [5, 0, 0])
    const d = computeInstanceBasedDefault([b2, b1], 1 * SEC)
    expect(d!.translation).toEqual([5, 0, 0])
  })

  it('アノテーションなし → null', () => {
    expect(computeInstanceBasedDefault([], 0)).toBeNull()
  })

  it('返り値はキャッシュと参照を共有しない（新規コピー）', () => {
    const single = ann(0, [1, 2, 3])
    const d = computeInstanceBasedDefault([single], 1 * SEC)
    d!.translation[0] = 999
    expect(single.translation[0]).toBe(1)
  })
})

describe('computeEgoBasedDefault', () => {
  it('ego の yaw 方向前方 default_forward_distance に配置、底面が地面高さに一致', () => {
    // yaw = 90°（+y 方向を向く ego）
    const egoPose = {
      translation: [100, 200, 1.8],
      rotation:    [Math.cos(Math.PI / 4), 0, 0, Math.sin(Math.PI / 4)],
    }
    // getGroundZ 指定時: 底面 = 検出した地面高さ
    const getGroundZ = (x: number, y: number) => {
      expect(x).toBeCloseTo(100)
      expect(y).toBeCloseTo(200 + ANNOTATION.DEFAULT_FORWARD_DISTANCE)
      return 0.5
    }
    const { translation, rotation } = computeEgoBasedDefault(egoPose, [2, 4, 2], getGroundZ)
    expect(translation[0]).toBeCloseTo(100)
    expect(translation[1]).toBeCloseTo(200 + ANNOTATION.DEFAULT_FORWARD_DISTANCE)
    expect(translation[2]).toBeCloseTo(0.5 + 1)  // 地面高さ + height/2
    expect(rotation[0]).toBeCloseTo(Math.cos(Math.PI / 4))
    expect(rotation[3]).toBeCloseTo(Math.sin(Math.PI / 4))
  })

  it('getGroundZ 未指定時は egoZ を地面高さとして使う', () => {
    const egoPose = { translation: [0, 0, 1.8], rotation: [1, 0, 0, 0] }
    const { translation } = computeEgoBasedDefault(egoPose, [2, 4, 2])
    expect(translation[2]).toBeCloseTo(1.8 + 1)
  })
})

describe('extractYawQuaternion', () => {
  it('roll / pitch を含むクォータニオンから yaw のみの z軸回転を構成する', () => {
    const q = eulerDegToQuaternion(90, 10, 5)
    const yawQ = extractYawQuaternion(q)
    expect(yawQ[0]).toBeCloseTo(Math.cos(Math.PI / 4))
    expect(yawQ[1]).toBeCloseTo(0)
    expect(yawQ[2]).toBeCloseTo(0)
    expect(yawQ[3]).toBeCloseTo(Math.sin(Math.PI / 4))
  })
})
