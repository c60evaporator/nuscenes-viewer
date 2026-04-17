import { describe, it, expect } from 'vitest'
import { project3DTo2D, egoPoseToPixel, bboxCornersToGlobal } from '@/lib/coordinateUtils'

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
  const ORIGIN: [number, number] = [0, 0]
  const SCALE = 10  // 10 px/m

  it('converts positive x to positive px', () => {
    const [px, py] = egoPoseToPixel([5, 0, 0], ORIGIN, SCALE)
    expect(px).toBeCloseTo(50)
    expect(py).toBeCloseTo(0)
  })

  it('inverts y axis (positive y → negative py)', () => {
    const [px, py] = egoPoseToPixel([0, 3, 0], ORIGIN, SCALE)
    expect(px).toBeCloseTo(0)
    expect(py).toBeCloseTo(-30)
  })

  it('ignores z coordinate', () => {
    const [px1, py1] = egoPoseToPixel([1, 1, 0], ORIGIN, SCALE)
    const [px2, py2] = egoPoseToPixel([1, 1, 999], ORIGIN, SCALE)
    expect(px1).toBeCloseTo(px2)
    expect(py1).toBeCloseTo(py2)
  })

  it('origin at (0,0,0) maps to pixel (0,0)', () => {
    const [px, py] = egoPoseToPixel([0, 0, 0], ORIGIN, SCALE)
    expect(px).toBeCloseTo(0)
    expect(py).toBeCloseTo(0)
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
