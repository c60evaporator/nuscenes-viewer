import { describe, it, expect, vi, beforeEach } from 'vitest'
import { drawEgoPoses, drawBBox2D, sensorToBevPixel } from '@/lib/canvasUtils'
import type { BevViewParams } from '@/lib/canvasUtils'
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
    // currentIndex=1 gets radius 7, others get radius 3 or 5
    const radii = arcCalls.map((c) => c[2])
    expect(radii[1]).toBe(7)
    expect(radii[0]).not.toBe(7)
    expect(radii[2]).not.toBe(7)
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
