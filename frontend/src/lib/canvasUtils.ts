/**
 * Canvas 描画ユーティリティ
 * コンポーネント内に描画ロジックを書かず、この関数群を経由する
 */
import type { EgoPosePoint } from '../types/sensor'
import { egoPoseToPixel } from './coordinateUtils'

// ── Ego Pose 描画 ────────────────────────────────────────────────────────────

export function drawEgoPoses(
  ctx:         CanvasRenderingContext2D,
  poses:       EgoPosePoint[],
  currentIndex: number,
  displaySize: [number, number],
  location:    string,
  showStartEnd: boolean = true,
): void {
  if (poses.length === 0) return

  const toPixel = (t: number[]): [number, number] =>
    egoPoseToPixel(t, location, displaySize)

  ctx.save()

  // 軌跡ライン
  ctx.beginPath()
  ctx.strokeStyle = 'rgba(100, 160, 255, 0.6)'
  ctx.lineWidth   = 1.5
  poses.forEach((pose, i) => {
    const [px, py] = toPixel(pose.translation)
    if (i === 0) ctx.moveTo(px, py)
    else         ctx.lineTo(px, py)
  })
  ctx.stroke()

  // 各点
  poses.forEach((pose, i) => {
    const [px, py] = toPixel(pose.translation)
    const isCurrent = i === currentIndex
    const isFirst   = i === 0
    const isLast    = i === poses.length - 1

    ctx.beginPath()
    if (isCurrent) {
      ctx.arc(px, py, 7, 0, Math.PI * 2)
      ctx.fillStyle = '#FF4444'
    } else if (isFirst || isLast) {
      ctx.arc(px, py, 5, 0, Math.PI * 2)
      ctx.fillStyle = isFirst ? '#44FF88' : '#FFAA44'
    } else {
      ctx.arc(px, py, 3, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(100, 160, 255, 0.8)'
    }
    ctx.fill()

    // Start / End ラベル
    if (showStartEnd && (isFirst || isLast)) {
      ctx.font      = 'bold 11px sans-serif'
      ctx.fillStyle = isFirst ? '#44FF88' : '#FFAA44'
      ctx.fillText(isFirst ? 'Start' : 'End', px + 8, py + 4)
    }
  })

  ctx.restore()
}

// ── BBox 2D 描画 ─────────────────────────────────────────────────────────────

/**
 * 2D 投影されたバウンディングボックスを Canvas に描画する
 *
 * @param ctx       CanvasRenderingContext2D
 * @param corners2D 8頂点の2Dピクセル座標（project3DTo2D で変換済み）
 *                  順序: [前右下, 前左下, 後左下, 後右下, 前右上, 前左上, 後左上, 後右上]
 * @param color     枠線の色（CSS color string）
 * @param label     前面上部に描画するラベル文字列（省略可）
 */
export function drawBBox2D(
  ctx:       CanvasRenderingContext2D,
  corners2D: [number, number][],
  color:     string,
  label?:    string,
): void {
  if (corners2D.length < 8) return

  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth   = 2

  // 前面: 0-1-2-3 下面、4-5-6-7 上面
  const drawFace = (indices: number[]) => {
    ctx.beginPath()
    ctx.moveTo(corners2D[indices[0]][0], corners2D[indices[0]][1])
    for (let i = 1; i < indices.length; i++) {
      ctx.lineTo(corners2D[indices[i]][0], corners2D[indices[i]][1])
    }
    ctx.closePath()
    ctx.stroke()
  }

  drawFace([0, 1, 2, 3])         // 下面
  drawFace([4, 5, 6, 7])         // 上面
  // 側面の縦辺
  ;[[0, 4], [1, 5], [2, 6], [3, 7]].forEach(([a, b]) => {
    ctx.beginPath()
    ctx.moveTo(corners2D[a][0], corners2D[a][1])
    ctx.lineTo(corners2D[b][0], corners2D[b][1])
    ctx.stroke()
  })

  // ラベル（前面上辺の中央）
  if (label) {
    const midX = (corners2D[4][0] + corners2D[5][0]) / 2
    const midY = (corners2D[4][1] + corners2D[5][1]) / 2 - 6
    ctx.font      = '12px sans-serif'
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.fillText(label, midX, midY)
  }

  ctx.restore()
}

// ── 点群 BEV 描画 ─────────────────────────────────────────────────────────────


export interface BevViewParams {
  width:   number   // Canvas 幅 (px)
  height:  number   // Canvas 高さ (px)
  scale:   number   // px/m
  offsetX: number   // 画面中心の x オフセット (m)
  offsetY: number   // 画面中心の y オフセット (m)
}

export function drawPointCloud(
  ctx:        CanvasRenderingContext2D,
  points:     number[][],
  viewParams: BevViewParams,
  options?: {
    pointSize?: number
    colorMode?: 'intensity' | 'height' | 'flat'
    baseColor?: string
  },
): void {
  if (points.length === 0) return

  const {
    pointSize = 2,
    colorMode = 'intensity',
    baseColor = '#00FFFF',
  } = options ?? {}

  const { width, height, scale, offsetX, offsetY } = viewParams
  const cx = width  / 2
  const cy = height / 2

  ctx.save()

  for (const p of points) {
    const [x, y, z, intensity] = p

    const px = cx + (y - offsetY) * scale
    const py = cy - (x - offsetX) * scale

    if (px < 0 || px > width || py < 0 || py > height) continue

    let color: string
    if (colorMode === 'intensity') {
      const normalized = Math.min((intensity ?? 0) / 255, 1)
      const r = Math.round(normalized * 200)
      const g = Math.round(100 + normalized * 155)
      const b = Math.round(200 + normalized * 55)
      color = `rgb(${r},${g},${b})`
    } else if (colorMode === 'height') {
      const normalized = Math.min(Math.max((z + 3) / 6, 0), 1)
      const r = Math.round(normalized * 255)
      const g = 100
      const b = Math.round((1 - normalized) * 255)
      color = `rgb(${r},${g},${b})`
    } else {
      color = baseColor
    }

    ctx.fillStyle = color
    ctx.fillRect(px - pointSize / 2, py - pointSize / 2, pointSize, pointSize)
  }

  ctx.restore()
}

// ── Map フィーチャー投影描画 ──────────────────────────────────────────────────

type RGBA = [number, number, number, number]

function rgbaToStyle([r, g, b, a]: RGBA): string {
  return `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`
}

/**
 * 投影済みポリゴン座標をカメラ画像 canvas に描画する（塗りつぶし＋輪郭）
 */
export function drawProjectedPolygon(
  ctx:    CanvasRenderingContext2D,
  points: [number, number][],
  color:  RGBA,
): void {
  if (points.length < 3) return
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(points[0][0], points[0][1])
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1])
  ctx.closePath()
  ctx.fillStyle   = rgbaToStyle(color)
  ctx.fill()
  ctx.strokeStyle = rgbaToStyle([color[0], color[1], color[2], 220])
  ctx.lineWidth   = 1
  ctx.stroke()
  ctx.restore()
}

/**
 * 投影済みライン座標をカメラ画像 canvas に描画する
 */
export function drawProjectedLine(
  ctx:       CanvasRenderingContext2D,
  points:    [number, number][],
  color:     RGBA,
  lineWidth  = 2,
): void {
  if (points.length < 2) return
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(points[0][0], points[0][1])
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1])
  ctx.strokeStyle = rgbaToStyle(color)
  ctx.lineWidth   = lineWidth
  ctx.stroke()
  ctx.restore()
}

/**
 * 投影済みポイントをカメラ画像 canvas に描画する（塗りつぶし円）
 */
export function drawProjectedPoint(
  ctx:    CanvasRenderingContext2D,
  point:  [number, number],
  color:  RGBA,
  radius  = 5,
): void {
  ctx.save()
  ctx.beginPath()
  ctx.arc(point[0], point[1], radius, 0, Math.PI * 2)
  ctx.fillStyle = rgbaToStyle(color)
  ctx.fill()
  ctx.restore()
}

/**
 * 投影済みライン座標をカメラ画像 canvas に矢印付きで描画する（末端に矢じり）
 */
export function drawProjectedArrow(
  ctx:      CanvasRenderingContext2D,
  points:   [number, number][],
  color:    RGBA,
  lineWidth = 2,
): void {
  if (points.length < 2) return
  drawProjectedLine(ctx, points, color, lineWidth)
  const [x1, y1] = points[points.length - 2]
  const [x2, y2] = points[points.length - 1]
  const angle   = Math.atan2(y2 - y1, x2 - x1)
  const headLen = 12
  ctx.save()
  ctx.fillStyle = rgbaToStyle(color)
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6))
  ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6))
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/**
 * カメラ画像 canvas に投影済み座標上にテキストラベルを描画する
 */
export function drawProjectedLabel(
  ctx:      CanvasRenderingContext2D,
  point:    [number, number],
  text:     string,
  color:    RGBA,
  fontSize  = 14,
): void {
  ctx.save()
  ctx.font         = `bold ${fontSize}px sans-serif`
  ctx.fillStyle    = rgbaToStyle(color)
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, point[0], point[1])
  ctx.restore()
}
