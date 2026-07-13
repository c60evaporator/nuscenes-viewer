import { describe, it, expect, vi, beforeEach } from 'vitest'
import { drawEgoPoses, drawBBox2D, sensorToBevPixel, bevPixelToSensor, hitTestEgoPoseGroups } from '@/lib/canvasUtils'
import type { BevViewParams } from '@/lib/canvasUtils'
import { egoPoseToPixel } from '@/lib/coordinateUtils'
import type { EgoPosePoint } from '@/types/sensor'

// Minimal CanvasRenderingContext2D mock
function makeCtx() {
  return {
    save:        vi.fn(),
    restore:     vi.fn(),
    beginPath:   vi.fn(),
    moveTo:      vi.fn(),
    lineTo:      vi.fn(),
    arc:         vi.fn(),
    fill:        vi.fn(),
    stroke:      vi.fn(),
    fillRect:    vi.fn(),
    fillText:    vi.fn(),
    closePath:   vi.fn(),
    measureText: vi.fn().mockReturnValue({ width: 0 }),
    rect:        vi.fn(),
    strokeStyle: '',
    fillStyle:   '',
    lineWidth:   0,
    font:        '',
    textAlign:   '',
  } as unknown as CanvasRenderingContext2D
}

function makePose(x: number, y: number, sampleToken = 'tok'): EgoPosePoint {
  return {
    sample_token: sampleToken,
    translation:  [x, y, 0],
    rotation:     [1, 0, 0, 0],
    timestamp:    0,
  }
}

describe('drawEgoPoses', () => {
  let ctx: CanvasRenderingContext2D

  beforeEach(() => { ctx = makeCtx() })

  const DISP: [number, number] = [1000, 1000]
  const LOC = 'singapore-onenorth'

  it('does nothing when poses array is empty', () => {
    drawEgoPoses(ctx, [], 0, DISP, LOC)
    expect(ctx.beginPath).not.toHaveBeenCalled()
  })

  it('calls save/restore for state isolation', () => {
    const poses = [makePose(0, 0), makePose(1, 1)]
    drawEgoPoses(ctx, poses, -1, DISP, LOC)
    expect(ctx.save).toHaveBeenCalledOnce()
    expect(ctx.restore).toHaveBeenCalledOnce()
  })

  it('draws arc for each pose point', () => {
    const poses = [makePose(0, 0), makePose(1, 0), makePose(2, 0)]
    drawEgoPoses(ctx, poses, -1, DISP, LOC)
    // One arc call per point
    expect(ctx.arc).toHaveBeenCalledTimes(3)
  })

  it('renders Start/End labels when showStartEnd=true (default)', () => {
    const poses = [makePose(0, 0), makePose(10, 10)]
    drawEgoPoses(ctx, poses, -1, DISP, LOC)
    expect(ctx.fillText).toHaveBeenCalledTimes(2)
    const calls = (ctx.fillText as ReturnType<typeof vi.fn>).mock.calls
    expect(calls[0][0]).toBe('Start')
    expect(calls[1][0]).toBe('End')
  })

  it('does not render Start/End labels when showStartEnd=false', () => {
    const poses = [makePose(0, 0), makePose(10, 10)]
    drawEgoPoses(ctx, poses, -1, DISP, LOC, false)
    expect(ctx.fillText).not.toHaveBeenCalled()
  })

  it('highlights the current index point with larger arc radius', () => {
    const poses = [makePose(0, 0), makePose(5, 5), makePose(10, 10)]
    drawEgoPoses(ctx, poses, 1, DISP, LOC)
    const arcCalls = (ctx.arc as ReturnType<typeof vi.fn>).mock.calls
    // currentIndex=1 should have a larger radius than the others
    const radii = arcCalls.map((c) => c[2])
    expect(radii[1]).toBeGreaterThan(radii[0])
    expect(radii[1]).toBeGreaterThan(radii[2])
  })
})

describe('hitTestEgoPoseGroups', () => {
  const DISP: [number, number] = [1000, 1000]
  const LOC = 'singapore-onenorth'

  // メートル座標 → canvas ピクセル（テスト内でクリック位置を組み立てる用）
  const toPixel = (x: number, y: number): [number, number] =>
    egoPoseToPixel([x, y, 0], LOC, DISP)

  it('ヒット半径内の点があればそのグループの index を返す', () => {
    const groups = [
      [makePose(100, 100), makePose(110, 100)],
      [makePose(500, 500), makePose(510, 500)],
    ]
    const [px, py] = toPixel(500, 500)
    expect(hitTestEgoPoseGroups(groups, [px + 2, py + 2], DISP, LOC, 5)).toBe(1)
  })

  it('複数グループが半径内にある場合は最近傍の点を持つグループが勝つ', () => {
    const groups = [
      [makePose(100, 100)],
      [makePose(101, 100)],  // ピクセルで約0.6px右
    ]
    const [px0, py0] = toPixel(100, 100)
    const [px1]      = toPixel(101, 100)
    // 両方が半径内に入るクリック位置（group 1 の点のすぐ近く）
    expect(hitTestEgoPoseGroups(groups, [px1 + 0.1, py0], DISP, LOC, 10)).toBe(1)
    // group 0 の点のすぐ近く
    expect(hitTestEgoPoseGroups(groups, [px0 - 0.1, py0], DISP, LOC, 10)).toBe(0)
  })

  it('半径内に点がなければ null を返す', () => {
    const groups = [[makePose(100, 100)]]
    const [px, py] = toPixel(100, 100)
    expect(hitTestEgoPoseGroups(groups, [px + 100, py], DISP, LOC, 5)).toBeNull()
  })

  it('空グループのみ・グループなしでは null を返す', () => {
    expect(hitTestEgoPoseGroups([], [0, 0], DISP, LOC, 5)).toBeNull()
    expect(hitTestEgoPoseGroups([[], []], [0, 0], DISP, LOC, 5)).toBeNull()
  })
})

describe('drawBBox2D', () => {
  let ctx: CanvasRenderingContext2D

  beforeEach(() => { ctx = makeCtx() })

  const makeCorners = (): [number, number][] => [
    [10, 50], [30, 50], [30, 70], [10, 70],  // 下面
    [10, 20], [30, 20], [30, 40], [10, 40],  // 上面
  ]

  it('does nothing with fewer than 8 corners', () => {
    drawBBox2D(ctx, [[0, 0], [1, 1], [2, 2]], '#fff')
    expect(ctx.beginPath).not.toHaveBeenCalled()
  })

  it('calls save/restore', () => {
    drawBBox2D(ctx, makeCorners(), '#0af')
    expect(ctx.save).toHaveBeenCalledOnce()
    expect(ctx.restore).toHaveBeenCalledOnce()
  })

  it('draws bottom face, top face, and 4 vertical edges (6 beginPath calls)', () => {
    drawBBox2D(ctx, makeCorners(), '#0af')
    // 2 faces + 4 vertical edges = 6 beginPath calls
    expect(ctx.beginPath).toHaveBeenCalledTimes(6)
  })

  it('applies the given color as strokeStyle', () => {
    drawBBox2D(ctx, makeCorners(), '#AABBCC')
    expect(ctx.strokeStyle).toBe('#AABBCC')
  })

  it('draws label when provided', () => {
    drawBBox2D(ctx, makeCorners(), '#fff', 'car')
    expect(ctx.fillText).toHaveBeenCalledWith('car', expect.any(Number), expect.any(Number))
  })

  it('does not draw label when not provided', () => {
    drawBBox2D(ctx, makeCorners(), '#fff')
    expect(ctx.fillText).not.toHaveBeenCalled()
  })
})

describe('sensorToBevPixel', () => {
  const baseView: BevViewParams = {
    width: 400, height: 400, scale: 5, offsetX: 0, offsetY: 0,
  }

  it('原点 (0, 0) は Canvas中央に変換される', () => {
    expect(sensorToBevPixel(0, 0, baseView)).toEqual([200, 200])
  })

  it('sensor座標 x=10 (前方10m) は Canvas上方向 (py < 200)', () => {
    const [, py] = sensorToBevPixel(10, 0, baseView)
    expect(py).toBe(200 - 10 * 5)
  })

  it('sensor座標 y=10 (左10m) は Canvas右方向 (px > 200)', () => {
    const [px] = sensorToBevPixel(0, 10, baseView)
    expect(px).toBe(200 + 10 * 5)
  })

  it('zoomとpanOffsetが反映される', () => {
    const view: BevViewParams = {
      width: 400, height: 400, scale: 10, offsetX: 5, offsetY: 0,
    }
    // sensor x=5 (= offsetX) は中央に来るはず
    const [, py] = sensorToBevPixel(5, 0, view)
    expect(py).toBe(200)
  })
})

describe('sensorToBevPixel と bevPixelToSensor の往復変換', () => {
  const view: BevViewParams = { width: 400, height: 400, scale: 5, offsetX: 1, offsetY: 2 }

  it('任意の sensor 座標 → ピクセル → sensor で元に戻る', () => {
    const sx = 10, sy = -5
    const [px, py] = sensorToBevPixel(sx, sy, view)
    const [rx, ry] = bevPixelToSensor(px, py, view)
    expect(rx).toBeCloseTo(sx, 5)
    expect(ry).toBeCloseTo(sy, 5)
  })

  it('原点 (offsetX, offsetY) は画面中央にマップされ往復も正確', () => {
    const [px, py] = sensorToBevPixel(view.offsetX, view.offsetY, view)
    expect(px).toBeCloseTo(view.width / 2, 5)
    expect(py).toBeCloseTo(view.height / 2, 5)
    const [rx, ry] = bevPixelToSensor(px, py, view)
    expect(rx).toBeCloseTo(view.offsetX, 5)
    expect(ry).toBeCloseTo(view.offsetY, 5)
  })

  it('負の sensor 座標でも往復が正確', () => {
    const sx = -8, sy = 3
    const [px, py] = sensorToBevPixel(sx, sy, view)
    const [rx, ry] = bevPixelToSensor(px, py, view)
    expect(rx).toBeCloseTo(sx, 5)
    expect(ry).toBeCloseTo(sy, 5)
  })
})
