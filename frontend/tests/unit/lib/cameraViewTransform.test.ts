import { describe, it, expect } from 'vitest'
import {
  CAMERA_ZOOM,
  computeCameraViewLayout,
  clampCameraPan,
  applyCameraWheelZoom,
} from '@/lib/cameraViewTransform'

const NO_PAN = { x: 0, y: 0 }

describe('computeCameraViewLayout', () => {
  it('zoom=1, pan=0 で従来の contain フィット（横長画像・中央配置）と一致する', () => {
    // 1600x900 画像を 800x600 コンテナに contain
    const l = computeCameraViewLayout(800, 600, 1600, 900, 1, NO_PAN)
    expect(l.displayW).toBe(800)
    expect(l.displayH).toBe(450)
    expect(l.offsetX).toBe(0)
    expect(l.offsetY).toBe(75)   // (600-450)/2
    expect(l.scaleX).toBe(0.5)
    expect(l.scaleY).toBe(0.5)
    expect(l.containerW).toBe(800)
    expect(l.containerH).toBe(600)
  })

  it('zoom=1, pan=0 で縦長画像も中央配置される', () => {
    const l = computeCameraViewLayout(800, 600, 900, 1800, 1, NO_PAN)
    expect(l.displayH).toBe(600)
    expect(l.displayW).toBe(300)
    expect(l.offsetX).toBe(250)  // (800-300)/2
    expect(l.offsetY).toBe(0)
  })

  it('zoom=1 では pan を与えても無視される（クランプで0）', () => {
    const l = computeCameraViewLayout(800, 600, 1600, 900, 1, { x: 100, y: -50 })
    expect(l.offsetX).toBe(0)
    expect(l.offsetY).toBe(75)
  })

  it('zoom=2 で表示サイズが2倍になり offset が範囲内にクランプされる', () => {
    const l = computeCameraViewLayout(800, 600, 1600, 900, 2, { x: -99999, y: 99999 })
    expect(l.displayW).toBe(1600)
    expect(l.displayH).toBe(900)
    // offset ∈ [container - display, 0]
    expect(l.offsetX).toBe(800 - 1600)
    expect(l.offsetY).toBe(0)
  })

  it('片軸のみコンテナを超える場合、超えない軸は中央固定のまま', () => {
    // 1600x900 を 800x600 に zoom=1.2: displayW=960 > 800, displayH=540 < 600
    const l = computeCameraViewLayout(800, 600, 1600, 900, 1.2, { x: 50, y: 50 })
    expect(l.displayW).toBeCloseTo(960)
    expect(l.displayH).toBeCloseTo(540)
    expect(l.offsetX).toBeCloseTo((800 - 960) / 2 + 50)
    expect(l.offsetY).toBeCloseTo((600 - 540) / 2)  // pan.y は無視（中央固定）
  })
})

describe('clampCameraPan', () => {
  it('表示がコンテナに収まる軸は pan=0 に強制される', () => {
    expect(clampCameraPan({ x: 30, y: -30 }, 800, 600, 700, 500)).toEqual({ x: 0, y: 0 })
  })

  it('コンテナを超える軸は ±(display-container)/2 にクランプされる', () => {
    const pan = clampCameraPan({ x: 9999, y: -9999 }, 800, 600, 1600, 1200)
    expect(pan.x).toBe(400)    // (1600-800)/2
    expect(pan.y).toBe(-300)   // -(1200-600)/2
  })

  it('コンテナ縮小後の古い大きな pan も範囲内に再クランプされる', () => {
    // ズーム中にコンテナが縮んだ想定: display も縮む
    const pan = clampCameraPan({ x: 400, y: 300 }, 400, 300, 800, 450)
    expect(pan.x).toBe(200)   // (800-400)/2
    expect(pan.y).toBe(75)    // (450-300)/2
  })

  it('範囲内の pan はそのまま返る', () => {
    expect(clampCameraPan({ x: 100, y: -50 }, 800, 600, 1600, 1200)).toEqual({ x: 100, y: -50 })
  })
})

describe('applyCameraWheelZoom', () => {
  const CW = 800, CH = 600, NW = 1600, NH = 900

  /** カーソル位置の画像座標（画像px）を求めるヘルパー */
  const imageCoordAt = (view: { zoom: number; pan: { x: number; y: number } }, cx: number, cy: number) => {
    const l = computeCameraViewLayout(CW, CH, NW, NH, view.zoom, view.pan)
    return { x: (cx - l.offsetX) / l.scaleX, y: (cy - l.offsetY) / l.scaleY }
  }

  it('ズームイン時、カーソル直下の画像座標が変わらない（アンカー不変性）', () => {
    const before = { zoom: 2, pan: { x: 50, y: -30 } }
    const cursor = { x: 500, y: 200 }
    const target = imageCoordAt(before, cursor.x, cursor.y)
    const after  = applyCameraWheelZoom(before, cursor.x, cursor.y, -100, CW, CH, NW, NH)
    expect(after.zoom).toBeCloseTo(2 * CAMERA_ZOOM.WHEEL_FACTOR)
    const actual = imageCoordAt(after, cursor.x, cursor.y)
    expect(actual.x).toBeCloseTo(target.x)
    expect(actual.y).toBeCloseTo(target.y)
  })

  it('ズームアウト時もアンカー不変性が成り立つ（クランプ非発動域）', () => {
    const before = { zoom: 5, pan: { x: 0, y: 0 } }
    const cursor = { x: 400, y: 300 }  // 中央: ズームアウトしてもクランプがかからない
    const target = imageCoordAt(before, cursor.x, cursor.y)
    const after  = applyCameraWheelZoom(before, cursor.x, cursor.y, 100, CW, CH, NW, NH)
    expect(after.zoom).toBeCloseTo(5 / CAMERA_ZOOM.WHEEL_FACTOR)
    const actual = imageCoordAt(after, cursor.x, cursor.y)
    expect(actual.x).toBeCloseTo(target.x)
    expect(actual.y).toBeCloseTo(target.y)
  })

  it('MIN=1 未満にはズームアウトできず、prev がそのまま返る', () => {
    const before = { zoom: 1, pan: { x: 0, y: 0 } }
    const after  = applyCameraWheelZoom(before, 400, 300, 100, CW, CH, NW, NH)
    expect(after).toBe(before)
  })

  it('MAX を超えるズームインは MAX にクランプされる', () => {
    const before = { zoom: CAMERA_ZOOM.MAX / 1.05, pan: { x: 0, y: 0 } }
    const after  = applyCameraWheelZoom(before, 400, 300, -100, CW, CH, NW, NH)
    expect(after.zoom).toBe(CAMERA_ZOOM.MAX)
  })

  it('1倍に戻ると pan は必ず (0,0) になる', () => {
    // zoom がちょうど 1 に到達するケース
    const before = { zoom: CAMERA_ZOOM.WHEEL_FACTOR, pan: { x: 40, y: 10 } }
    const after  = applyCameraWheelZoom(before, 100, 100, 100, CW, CH, NW, NH)
    expect(after.zoom).toBeCloseTo(1)
    expect(after.pan.x).toBeCloseTo(0)
    expect(after.pan.y).toBeCloseTo(0)
  })

  it('端でのズームでも offset がクランプ範囲を出ない', () => {
    // 画像の左上端にカーソルを置いて大きくズームイン
    let view = { zoom: 1, pan: { x: 0, y: 0 } }
    for (let i = 0; i < 20; i++) {
      view = applyCameraWheelZoom(view, 0, 75, -100, CW, CH, NW, NH)
      const l = computeCameraViewLayout(CW, CH, NW, NH, view.zoom, view.pan)
      if (l.displayW > CW) {
        expect(l.offsetX).toBeLessThanOrEqual(0)
        expect(l.offsetX).toBeGreaterThanOrEqual(CW - l.displayW)
      }
      if (l.displayH > CH) {
        expect(l.offsetY).toBeLessThanOrEqual(0)
        expect(l.offsetY).toBeGreaterThanOrEqual(CH - l.displayH)
      }
    }
    expect(view.zoom).toBe(CAMERA_ZOOM.MAX)
  })
})
