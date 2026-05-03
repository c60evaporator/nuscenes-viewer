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

  // basemapが大きいほどサイズを拡大補正（基準: 幅3000px想定）
  const sizeScale = displaySize[0] / 3000

  const dotRadius    = Math.round(4  * sizeScale)
  const currentRadius= Math.round(8  * sizeScale)
  const endRadius    = Math.round(6  * sizeScale)
  const fontSize     = Math.round(14 * sizeScale)
  const lineWidth    = Math.max(2 * sizeScale, 1)
  const labelPadX    = Math.round(8  * sizeScale)
  const labelOffsetX = Math.round(10 * sizeScale)

  ctx.save()

  // 軌跡ライン
  ctx.beginPath()
  ctx.strokeStyle = 'rgba(100, 160, 255, 0.6)'
  ctx.lineWidth   = lineWidth
  ctx.lineJoin    = 'round'
  ctx.lineCap     = 'round'
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

    const radius = isCurrent ? currentRadius : (isFirst || isLast) ? endRadius : dotRadius
    const color  = isCurrent ? '#FF4444' : isFirst ? '#44FF88' : isLast ? '#FFAA44' : 'rgba(100, 160, 255, 0.8)'

    ctx.beginPath()
    ctx.arc(px, py, radius, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()

    // Start / End ラベル（背景付き角丸）
    if (showStartEnd && (isFirst || isLast)) {
      const label = isFirst ? 'Start' : 'End'
      const lx    = px + labelOffsetX
      const ly    = py

      ctx.font = `500 ${fontSize}px system-ui, -apple-system, sans-serif`
      const tw = ctx.measureText(label).width

      // 背景
      const bgX = lx - labelPadX / 2
      const bgY = ly - fontSize * 0.75
      const bgW = tw + labelPadX
      const bgH = fontSize * 1.4

      ctx.fillStyle = color
      ctx.beginPath()
      if (ctx.roundRect) {
        ctx.roundRect(bgX, bgY, bgW, bgH, 4 * sizeScale)
      } else {
        ctx.rect(bgX, bgY, bgW, bgH)
      }
      ctx.fill()

      // テキスト
      ctx.fillStyle    = '#000000'
      ctx.textAlign    = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, lx, ly)
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

/**
 * センサー座標 (x, y) を BEV Canvas の Y軸反転後ピクセル座標に変換する
 * PointCloudCanvas 内の toPixel 関数と完全に同じ計算式
 *
 * @param sensorX  センサー座標系の x (前方が +)
 * @param sensorY  センサー座標系の y (左が +)
 * @param view     BEVビューパラメータ (zoom/pan反映済み)
 * @returns        Canvas/Konva ピクセル座標 [px, py]
 */
export function sensorToBevPixel(
  sensorX: number,
  sensorY: number,
  view:    BevViewParams,
): [number, number] {
  const cx = view.width  / 2
  const cy = view.height / 2
  return [
    cx + (sensorY - view.offsetY) * view.scale,
    cy - (sensorX - view.offsetX) * view.scale,
  ]
}

/**
 * BEV Layer-local ピクセル座標 → センサー座標系の (x, y) に逆変換する
 * sensorToBevPixel の逆関数。Konva の node.position() 等の Layer-local 座標を入力する。
 *
 * @param konvaX Layer-local x 座標
 * @param konvaY Layer-local y 座標 (Layer scaleY=-1 適用後)
 * @param view   BEVビューパラメータ
 * @returns      センサー座標系の [sensorX, sensorY] (m)
 */
export function bevPixelToSensor(
  konvaX: number,
  konvaY: number,
  view:   BevViewParams,
): [number, number] {
  const cx = view.width  / 2
  const cy = view.height / 2
  return [
    (cy - konvaY) / view.scale + view.offsetX,
    (konvaX - cx) / view.scale + view.offsetY,
  ]
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
