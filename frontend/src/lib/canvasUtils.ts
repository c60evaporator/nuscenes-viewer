/**
 * Canvas 描画ユーティリティ
 * コンポーネント内に描画ロジックを書かず、この関数群を経由する
 */
import type { EgoPosePoint } from '../types/sensor'

// ── Ego Pose 描画 ────────────────────────────────────────────────────────────

/**
 * マップ Canvas 上に Ego Pose の軌跡を描画する
 *
 * @param ctx           CanvasRenderingContext2D
 * @param poses         EgoPosePoint の配列（timestamp 昇順）
 * @param currentIndex  強調する点のインデックス（-1 で強調なし）
 * @param mapImageSize  マップ画像サイズ { width, height }（ピクセル）
 *
 * Canvas の座標系は左上が原点のため、y 軸は反転して描画する。
 * poses の translation は ENU メートル単位。
 * マップ全体の範囲に収まるよう自動スケーリングする。
 */
export function drawEgoPoses(
  ctx:          CanvasRenderingContext2D,
  poses:        EgoPosePoint[],
  currentIndex: number,
  mapImageSize: { width: number; height: number },
  showStartEnd: boolean = true,
): void {
  if (poses.length === 0) return

  // 座標範囲を計算してスケーリング係数を求める
  const xs = poses.map((p) => p.translation[0])
  const ys = poses.map((p) => p.translation[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  const rangeX = maxX - minX || 1
  const rangeY = maxY - minY || 1
  const padding = 40  // px

  const scaleX = (mapImageSize.width  - padding * 2) / rangeX
  const scaleY = (mapImageSize.height - padding * 2) / rangeY
  const scale  = Math.min(scaleX, scaleY)

  const toPixel = (tx: number, ty: number): [number, number] => [
    padding + (tx - minX) * scale,
    mapImageSize.height - padding - (ty - minY) * scale,  // y 軸反転
  ]

  ctx.save()

  // 軌跡ライン
  ctx.beginPath()
  ctx.strokeStyle = 'rgba(100, 160, 255, 0.6)'
  ctx.lineWidth   = 1.5
  poses.forEach((pose, i) => {
    const [px, py] = toPixel(pose.translation[0], pose.translation[1])
    if (i === 0) ctx.moveTo(px, py)
    else         ctx.lineTo(px, py)
  })
  ctx.stroke()

  // 各点
  poses.forEach((pose, i) => {
    const [px, py] = toPixel(pose.translation[0], pose.translation[1])
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

/**
 * 点群を真上から見た BEV（Bird's Eye View）で Canvas に描画する
 *
 * @param ctx        CanvasRenderingContext2D
 * @param points     各点: [x, y, z, intensity, ...]（z は使用しない）
 * @param viewParams ビューパラメータ
 *
 * intensity（0–255 想定）に応じて青→白のグラデーションで色付けする。
 */
export function drawPointCloud(
  ctx:        CanvasRenderingContext2D,
  points:     number[][],
  viewParams: BevViewParams,
): void {
  if (points.length === 0) return

  const { width, height, scale, offsetX, offsetY } = viewParams
  const cx = width  / 2
  const cy = height / 2

  ctx.save()

  for (const pt of points) {
    const [x, y, , intensity = 128] = pt

    // BEV 変換: x=前方(上), y=左(右), z=上（無視）
    const px = cx + (y - offsetY) * scale   // 左が画面右
    const py = cy - (x - offsetX) * scale   // 前方が画面上

    if (px < 0 || px >= width || py < 0 || py >= height) continue

    // intensity → 色（0=暗い青, 255=白）
    const t = Math.max(0, Math.min(1, intensity / 255))
    const r = Math.round(t * 255)
    const g = Math.round(t * 220)
    const b = Math.round(50 + t * 205)

    ctx.fillStyle = `rgb(${r},${g},${b})`
    ctx.fillRect(px, py, 1, 1)
  }

  ctx.restore()
}
