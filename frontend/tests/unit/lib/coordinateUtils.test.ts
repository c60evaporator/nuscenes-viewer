import { describe, it, expect } from 'vitest'
import { project3DTo2D, egoPoseToPixel, bboxCornersToGlobal, quaternionToEulerDeg, eulerDegToQuaternion, globalToSensor, sensorToGlobal } from '@/lib/coordinateUtils'

// Identity ego pose and sensor: no rotation, no translation
const IDENTITY_POSE = {
  translation: [0, 0, 0],
  rotation: [1, 0, 0, 0],  // w=1 → identity quaternion
}

// Simple 3×3 intrinsic with fx=fy=100, cx=320, cy=240
const INTRINSIC = [
  [100, 0, 320],
  [0, 100, 240],
  [0, 0, 1],
]

describe('project3DTo2D', () => {
  it('projects a point directly in front of camera', () => {
    // Point at (0, 0, 5) in camera coords → should project to (cx, cy) = (320, 240)
    const result = project3DTo2D([0, 0, 5], INTRINSIC, IDENTITY_POSE, IDENTITY_POSE)
    expect(result).not.toBeNull()
    expect(result![0]).toBeCloseTo(320)
    expect(result![1]).toBeCloseTo(240)
  })

  it('projects offset point correctly', () => {
    // Point at (1, 0, 5): u = 100*(1/5) + 320 = 340, v = 240
    const result = project3DTo2D([1, 0, 5], INTRINSIC, IDENTITY_POSE, IDENTITY_POSE)
    expect(result).not.toBeNull()
    expect(result![0]).toBeCloseTo(340)
    expect(result![1]).toBeCloseTo(240)
  })

  it('returns null for point behind camera (z <= 0)', () => {
    const result = project3DTo2D([0, 0, -1], INTRINSIC, IDENTITY_POSE, IDENTITY_POSE)
    expect(result).toBeNull()
  })

  it('returns null for point at z=0', () => {
    const result = project3DTo2D([0, 0, 0], INTRINSIC, IDENTITY_POSE, IDENTITY_POSE)
    expect(result).toBeNull()
  })

  it('accounts for ego pose translation', () => {
    // Ego at (10, 0, 0), point at (10, 0, 5) → same as identity case
    const egoPose = { translation: [10, 0, 0], rotation: [1, 0, 0, 0] }
    const result = project3DTo2D([10, 0, 5], INTRINSIC, egoPose, IDENTITY_POSE)
    expect(result).not.toBeNull()
    expect(result![0]).toBeCloseTo(320)
    expect(result![1]).toBeCloseTo(240)
  })
})

describe('egoPoseToPixel', () => {
  // singapore-onenorth: canvasEdge=[1585.6, 2025.0], dispSize=[1000, 1000]
  const LOC  = 'singapore-onenorth'
  const DISP: [number, number] = [1000, 1000]

  it('converts x proportionally to dispW', () => {
    // px = (600 / 1585.6) * 1000 ≈ 378.4
    const [px] = egoPoseToPixel([600, 0, 0], LOC, DISP)
    expect(px).toBeCloseTo(600 / 1585.6 * 1000, 1)
  })

  it('inverts y axis (positive y → py < dispH)', () => {
    // py = (1 - 900 / 2025.0) * 1000 ≈ 555.6
    const [, py] = egoPoseToPixel([0, 900, 0], LOC, DISP)
    expect(py).toBeCloseTo((1 - 900 / 2025.0) * 1000, 1)
  })

  it('ignores z coordinate', () => {
    const [px1, py1] = egoPoseToPixel([100, 100, 0],   LOC, DISP)
    const [px2, py2] = egoPoseToPixel([100, 100, 999], LOC, DISP)
    expect(px1).toBeCloseTo(px2)
    expect(py1).toBeCloseTo(py2)
  })

  it('origin (0,0,0) maps to top-left (0, dispH)', () => {
    // x=0 → px=0; y=0 → py=(1-0)*dispH=dispH
    const [px, py] = egoPoseToPixel([0, 0, 0], LOC, DISP)
    expect(px).toBeCloseTo(0)
    expect(py).toBeCloseTo(1000)
  })

  it('returns [0,0] for unknown location', () => {
    const result = egoPoseToPixel([100, 100, 0], 'unknown-place', DISP)
    expect(result).toEqual([0, 0])
  })
})

describe('bboxCornersToGlobal', () => {
  it('returns 8 corners', () => {
    const corners = bboxCornersToGlobal([0, 0, 0], [1, 0, 0, 0], [2, 4, 1])
    expect(corners).toHaveLength(8)
  })

  it('centers the box at the given translation', () => {
    const corners = bboxCornersToGlobal([10, 20, 5], [1, 0, 0, 0], [2, 4, 2])
    const cx = corners.reduce((s, c) => s + c[0], 0) / 8
    const cy = corners.reduce((s, c) => s + c[1], 0) / 8
    const cz = corners.reduce((s, c) => s + c[2], 0) / 8
    expect(cx).toBeCloseTo(10)
    expect(cy).toBeCloseTo(20)
    expect(cz).toBeCloseTo(5)
  })

  it('produces correct extents for identity rotation', () => {
    const [w, l, h] = [2, 4, 1]
    const corners = bboxCornersToGlobal([0, 0, 0], [1, 0, 0, 0], [w, l, h])
    const xs = corners.map((c) => c[0])
    const ys = corners.map((c) => c[1])
    const zs = corners.map((c) => c[2])
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(l)  // x=前方=length
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(w)  // y=左右=width
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(h)
  })
})

describe('quaternionToEulerDeg / eulerDegToQuaternion 往復変換', () => {
  it('単位クォータニオン → euler (0,0,0) → 単位クォータニオン', () => {
    const e = quaternionToEulerDeg([1, 0, 0, 0])
    expect(e.yaw).toBeCloseTo(0, 5)
    expect(e.pitch).toBeCloseTo(0, 5)
    expect(e.roll).toBeCloseTo(0, 5)
    const q2 = eulerDegToQuaternion(e.yaw, e.pitch, e.roll)
    expect(q2[0]).toBeCloseTo(1, 5)
    expect(q2[1]).toBeCloseTo(0, 5)
    expect(q2[2]).toBeCloseTo(0, 5)
    expect(q2[3]).toBeCloseTo(0, 5)
  })

  it('z軸まわり90度回転の往復', () => {
    const q1 = [Math.cos(Math.PI / 4), 0, 0, Math.sin(Math.PI / 4)]
    const e  = quaternionToEulerDeg(q1)
    expect(e.yaw).toBeCloseTo(90, 3)
    const q2 = eulerDegToQuaternion(e.yaw, e.pitch, e.roll)
    expect(q2[0]).toBeCloseTo(q1[0], 5)
    expect(q2[3]).toBeCloseTo(q1[3], 5)
  })

  it('複合回転の往復 (yaw=45, pitch=10, roll=5)', () => {
    const q1 = eulerDegToQuaternion(45, 10, 5)
    const e  = quaternionToEulerDeg(q1)
    expect(e.yaw).toBeCloseTo(45, 2)
    expect(e.pitch).toBeCloseTo(10, 2)
    expect(e.roll).toBeCloseTo(5, 2)
    const q2 = eulerDegToQuaternion(e.yaw, e.pitch, e.roll)
    expect(q2[0]).toBeCloseTo(q1[0], 4)
    expect(q2[1]).toBeCloseTo(q1[1], 4)
    expect(q2[2]).toBeCloseTo(q1[2], 4)
    expect(q2[3]).toBeCloseTo(q1[3], 4)
  })
})

describe('globalToSensor / sensorToGlobal 往復変換', () => {
  const identity = { translation: [0, 0, 0], rotation: [1, 0, 0, 0] }
  const egoPose = {
    translation: [100, 200, 0],
    rotation:    [Math.cos(Math.PI / 4), 0, 0, Math.sin(Math.PI / 4)],  // z軸90度
  }
  const calibSensor = {
    translation: [1, 0, 1.5],
    rotation:    [1, 0, 0, 0],
  }

  it('単位 egoPose + 単位 calibSensor での往復', () => {
    const original = [10, 20, 1]
    const sensor   = globalToSensor(original, identity, identity)
    const global   = sensorToGlobal(sensor, identity, identity)
    expect(global[0]).toBeCloseTo(original[0], 5)
    expect(global[1]).toBeCloseTo(original[1], 5)
    expect(global[2]).toBeCloseTo(original[2], 5)
  })

  it('複雑な ego/calib での往復', () => {
    const original = [105, 210, 2]
    const sensor   = globalToSensor(original, egoPose, calibSensor)
    const global   = sensorToGlobal(sensor, egoPose, calibSensor)
    expect(global[0]).toBeCloseTo(original[0], 5)
    expect(global[1]).toBeCloseTo(original[1], 5)
    expect(global[2]).toBeCloseTo(original[2], 5)
  })

  it('sensorToGlobal から globalToSensor の順でも往復が成立する', () => {
    const sensorPt = [3, -2, 1]
    const global   = sensorToGlobal(sensorPt, egoPose, calibSensor)
    const back     = globalToSensor(global, egoPose, calibSensor)
    expect(back[0]).toBeCloseTo(sensorPt[0], 5)
    expect(back[1]).toBeCloseTo(sensorPt[1], 5)
    expect(back[2]).toBeCloseTo(sensorPt[2], 5)
  })
})
