/**
 * 動画フレーム合成
 *
 * 選択センサーをグリッド配置し、Sample画面の SensorCell と同等の内容
 * （カメラ画像 + BBox / 点群BEV + BBox / EGO_POSE waypoint）を
 * 1 枚の Canvas に描画する純関数群。
 * 描画プリミティブは canvasUtils / coordinateUtils を流用する。
 */
import type { Annotation } from '@/types/annotation'
import type { CalibratedSensor, EgoPosePoint, PointCloud, SensorDataBrief } from '@/types/sensor'
import {
  drawCameraBBoxes,
  drawPointCloud,
  drawBBox2D,
  drawArrow2D,
  drawEgoPoses,
  sensorToBevPixel,
  type BevViewParams,
} from './canvasUtils'
import {
  bboxCornersToGlobal,
  globalToSensor,
  globalToMapPixel,
  egoPoseToPixel,
  NUSCENES_MAP_META,
} from './coordinateUtils'
import { getBBoxFrontCenter, getBBoxArrowTip } from './bboxArrowGeometry'
import { WAYPOINTS } from '@/config/settings'

// ── レイアウト ────────────────────────────────────────────────────────────────

/** セルサイズ（16:9、nuScenes カメラ 1600x900 と同比率） */
export const VIDEO_CELL_W = 640
export const VIDEO_CELL_H = 360

/** SensorGrid の DEFAULT_GRID_CONFIG の flatten 順（グリッド配置順の基準） */
export const VIDEO_CHANNEL_ORDER = [
  'EGO_POSE', 'LIDAR_TOP', 'RADAR_FRONT',
  'CAM_FRONT_LEFT', 'CAM_FRONT', 'CAM_FRONT_RIGHT',
  'CAM_BACK_LEFT', 'CAM_BACK', 'CAM_BACK_RIGHT',
] as const

export interface VideoLayoutCell {
  channel: string
  x: number
  y: number
  w: number
  h: number
}

export interface VideoLayout {
  width:  number
  height: number
  cols:   number
  rows:   number
  cells:  VideoLayoutCell[]
}

/**
 * 選択チャンネルを VIDEO_CHANNEL_ORDER 順に cols=ceil(√n) のグリッドへ配置する。
 * 例: 9チャンネル → 3x3 (1920x1080)、6チャンネル → 3x2
 */
export function computeVideoLayout(channels: string[]): VideoLayout {
  const order   = VIDEO_CHANNEL_ORDER as readonly string[]
  const ordered = [
    ...order.filter((c) => channels.includes(c)),
    ...channels.filter((c) => !order.includes(c)),
  ]
  const n = ordered.length
  if (n === 0) return { width: 0, height: 0, cols: 0, rows: 0, cells: [] }

  const cols = Math.ceil(Math.sqrt(n))
  const rows = Math.ceil(n / cols)
  const cells = ordered.map((channel, i) => ({
    channel,
    x: (i % cols) * VIDEO_CELL_W,
    y: Math.floor(i / cols) * VIDEO_CELL_H,
    w: VIDEO_CELL_W,
    h: VIDEO_CELL_H,
  }))
  return { width: cols * VIDEO_CELL_W, height: rows * VIDEO_CELL_H, cols, rows, cells }
}

// ── フレームデータ ────────────────────────────────────────────────────────────

/** 1フレーム・1チャンネル分のプリフェッチ済みデータ */
export interface ChannelFrameData {
  brief:       SensorDataBrief | null
  image?:      ImageBitmap | null   // CAM_* のみ
  pointCloud?: PointCloud | null    // LIDAR_TOP / RADAR_* のみ
  /** BEV の BBox 投影に使う calib（RADAR は LIDAR_TOP の calib） */
  bevCalib?:   { translation: number[]; rotation: number[] } | null
}

/** 1フレーム（=1 Sample）分のデータ */
export interface VideoFrameData {
  sampleIndex: number                  // EGO_POSE セルのハイライト用
  annotations: Annotation[]
  /** サンプル基準の ego pose（LIDAR_TOP 優先、SensorCell の getSampleEgoPose と同じ規約） */
  egoPose:     { translation: number[]; rotation: number[] } | null
  channels:    Record<string, ChannelFrameData>
}

/** シーン全体で共通のコンテキスト */
export interface VideoFrameContext {
  layout:         VideoLayout
  calibSensorMap: Record<string, CalibratedSensor>
  egoPoses:       EgoPosePoint[]
  basemap:        ImageBitmap | null
  location:       string | null
}

// ── 描画 ─────────────────────────────────────────────────────────────────────

const BEV_AXES_LIMIT_M = 40  // PointCloudCanvas の axesLimitMeters と同値

/** 1フレームを黒背景 + セルグリッドで描画する */
export function drawVideoFrame(
  ctx:   CanvasRenderingContext2D,
  frame: VideoFrameData,
  mfc:   VideoFrameContext,
): void {
  const { layout } = mfc
  ctx.fillStyle = '#111'
  ctx.fillRect(0, 0, layout.width, layout.height)

  for (const cell of layout.cells) {
    ctx.save()
    ctx.translate(cell.x, cell.y)
    ctx.beginPath()
    ctx.rect(0, 0, cell.w, cell.h)
    ctx.clip()

    drawCell(ctx, cell, frame, mfc)
    drawChannelLabel(ctx, cell.channel)

    ctx.restore()
  }
}

/** SensorCell のチャンネル名ラベルと同等の表示 */
function drawChannelLabel(ctx: CanvasRenderingContext2D, channel: string): void {
  ctx.save()
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
  ctx.fillRect(0, 0, VIDEO_CELL_W, 14)
  ctx.font      = '10px sans-serif'
  ctx.fillStyle = '#aaa'
  ctx.textAlign = 'left'
  ctx.fillText(channel, 4, 11)
  ctx.restore()
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, cell: VideoLayoutCell, text: string): void {
  ctx.save()
  ctx.font      = '12px sans-serif'
  ctx.fillStyle = '#666'
  ctx.textAlign = 'center'
  ctx.fillText(text, cell.w / 2, cell.h / 2)
  ctx.restore()
}

/** SensorCell の dispatch と同じ規則でセル内容を描画する */
function drawCell(
  ctx:   CanvasRenderingContext2D,
  cell:  VideoLayoutCell,
  frame: VideoFrameData,
  mfc:   VideoFrameContext,
): void {
  const { channel } = cell

  if (channel === 'EGO_POSE') {
    if (!mfc.location || !mfc.basemap || mfc.egoPoses.length === 0) {
      drawPlaceholder(ctx, cell, 'No Map')
      return
    }
    drawEgoPoseCell(ctx, cell, frame.sampleIndex, mfc)
    return
  }

  const data = frame.channels[channel]

  if (channel === 'LIDAR_TOP' || channel.startsWith('RADAR_')) {
    if (!data?.brief || !data.pointCloud) {
      drawPlaceholder(ctx, cell, `No ${channel}`)
      return
    }
    drawBevCell(ctx, cell, data, frame, mfc, channel.startsWith('RADAR_'))
    return
  }

  if (channel.startsWith('CAM_')) {
    if (!data?.brief || !data.image) {
      drawPlaceholder(ctx, cell, `No ${channel}`)
      return
    }
    drawCameraCell(ctx, cell, data, frame, mfc)
    return
  }

  drawPlaceholder(ctx, cell, channel)
}

// ── カメラセル ────────────────────────────────────────────────────────────────

function drawCameraCell(
  ctx:   CanvasRenderingContext2D,
  cell:  VideoLayoutCell,
  data:  ChannelFrameData,
  frame: VideoFrameData,
  mfc:   VideoFrameContext,
): void {
  const image = data.image!
  const brief = data.brief!

  // contain-fit（CameraImageCanvas と同じ）
  const scale = Math.min(cell.w / image.width, cell.h / image.height)
  const dw = image.width  * scale
  const dh = image.height * scale
  const dx = (cell.w - dw) / 2
  const dy = (cell.h - dh) / 2
  ctx.drawImage(image, dx, dy, dw, dh)

  // BBox 投影は元画像解像度基準（max_size 縮小画像でも brief.width/height でスケール補正）
  const calib = mfc.calibSensorMap[brief.calibrated_sensor_token]
  if (!calib?.camera_intrinsic || frame.annotations.length === 0) return
  const egoPose = brief.ego_pose  // カメラ SampleData 自身の ego pose

  const naturalW = brief.width  ?? image.width
  const naturalH = brief.height ?? image.height
  const scaleX = dw / naturalW
  const scaleY = dh / naturalH

  ctx.save()
  ctx.translate(dx, dy)
  drawCameraBBoxes(
    ctx, frame.annotations, egoPose,
    { translation: calib.translation, rotation: calib.rotation },
    calib.camera_intrinsic, scaleX, scaleY,
  )
  ctx.restore()
}

// ── 点群 BEV セル ─────────────────────────────────────────────────────────────

/**
 * PointCloudCanvas の zoom=1 / pan=0 相当の固定 BEV を、セル中央の正方形に描画する。
 * basemap の切り出し・回転ロジックは PointCloudCanvas.tsx の描画 effect と同一。
 */
function drawBevCell(
  ctx:     CanvasRenderingContext2D,
  cell:    VideoLayoutCell,
  data:    ChannelFrameData,
  frame:   VideoFrameData,
  mfc:     VideoFrameContext,
  isRadar: boolean,
): void {
  const size = Math.min(cell.w, cell.h)
  const ox = (cell.w - size) / 2
  const oy = (cell.h - size) / 2

  const viewParams: BevViewParams = {
    width:   size,
    height:  size,
    scale:   size / (BEV_AXES_LIMIT_M * 2),
    offsetX: 0,
    offsetY: 0,
  }

  const egoPose = frame.egoPose

  // basemap 切り出し・回転描画（devkit の render_ego_centric_map() 相当）
  if (mfc.basemap && egoPose && mfc.location) {
    const meta = NUSCENES_MAP_META[mfc.location]
    if (meta) {
      const bitmap = mfc.basemap
      const { resolution } = meta
      const axesLimitPx = BEV_AXES_LIMIT_M / resolution

      const [w, qx, qy, qz] = egoPose.rotation
      const yaw = Math.atan2(2 * (w * qz + qx * qy), 1 - 2 * (qy * qy + qz * qz))

      const centerPixel = globalToMapPixel(
        egoPose.translation[0], egoPose.translation[1], mfc.location,
      )
      if (centerPixel) {
        const [cx_map, cy_map] = centerPixel

        // bitmap はリサイズ済みの可能性があるためスケール係数を計算
        const origW  = meta.canvasEdge[0] / resolution
        const origH  = meta.canvasEdge[1] / resolution
        const scaleX = bitmap.width  / origW
        const scaleY = bitmap.height / origH

        // √2 倍の範囲を切り出す（回転後のクリッピング防止）
        const cropSize = Math.ceil(axesLimitPx * Math.sqrt(2))

        const offscreen = new OffscreenCanvas(cropSize * 2, cropSize * 2)
        const offCtx    = offscreen.getContext('2d')!
        offCtx.drawImage(
          bitmap,
          (cx_map - cropSize) * scaleX, (cy_map - cropSize) * scaleY,
          cropSize * 2 * scaleX,        cropSize * 2 * scaleY,
          0, 0,
          cropSize * 2, cropSize * 2,
        )

        const rotCanvas = new OffscreenCanvas(cropSize * 2, cropSize * 2)
        const rotCtx    = rotCanvas.getContext('2d')!
        rotCtx.translate(cropSize, cropSize)
        rotCtx.rotate(yaw)
        rotCtx.translate(-cropSize, -cropSize)
        rotCtx.drawImage(offscreen, 0, 0)

        ctx.globalAlpha = 0.5
        ctx.drawImage(
          rotCanvas,
          cropSize - axesLimitPx, cropSize - axesLimitPx,
          axesLimitPx * 2,        axesLimitPx * 2,
          ox, oy, size, size,
        )
        ctx.globalAlpha = 1.0
      }
    }
  }

  // 点群描画（Y軸反転して地図の座標系に合わせる）
  ctx.save()
  ctx.translate(ox, oy + size)
  ctx.scale(1, -1)
  drawPointCloud(ctx, data.pointCloud!.points, viewParams, {
    pointSize: isRadar ? 4 : 2,
    colorMode: 'intensity',
  })

  // BBox 描画（PointCloudCanvas と同じ変換: global → sensor → BEV pixel）
  const bevCalib = data.bevCalib
  if (frame.annotations.length > 0 && egoPose && bevCalib) {
    for (const ann of frame.annotations) {
      const globalCorners = bboxCornersToGlobal(ann.translation, ann.rotation, ann.size)
      const corners2D = globalCorners.map((corner) => {
        const sensorPt = globalToSensor(corner, egoPose, bevCalib)
        return sensorToBevPixel(sensorPt[0], sensorPt[1], viewParams)
      }) as [number, number][]

      drawBBox2D(ctx, corners2D, '#4ADE80')

      const arrowExtra = Math.min(1.0, ann.size[1] * 0.3)
      const arrowStartGlobal = getBBoxFrontCenter(ann.translation, ann.rotation, ann.size)
      const arrowEndGlobal   = getBBoxArrowTip(ann.translation, ann.rotation, ann.size, arrowExtra)
      const arrowStartSensor = globalToSensor(arrowStartGlobal, egoPose, bevCalib)
      const arrowEndSensor   = globalToSensor(arrowEndGlobal,   egoPose, bevCalib)
      const arrowStartPx = sensorToBevPixel(arrowStartSensor[0], arrowStartSensor[1], viewParams)
      const arrowEndPx   = sensorToBevPixel(arrowEndSensor[0],   arrowEndSensor[1],   viewParams)
      drawArrow2D(ctx, arrowStartPx, arrowEndPx, '#4ADE80', 2, 6, 6)
    }
  }
  ctx.restore()
}

// ── EGO_POSE セル ─────────────────────────────────────────────────────────────

/**
 * basemap をシーンの ego pose 範囲 + マージンでクロップし、
 * drawEgoPoses で waypoint（現在サンプルを強調）を重ねて描画する。
 */
function drawEgoPoseCell(
  ctx:         CanvasRenderingContext2D,
  cell:        VideoLayoutCell,
  sampleIndex: number,
  mfc:         VideoFrameContext,
): void {
  const bitmap   = mfc.basemap!
  const location = mfc.location!
  const meta = NUSCENES_MAP_META[location]
  if (!meta) {
    drawPlaceholder(ctx, cell, 'No Map')
    return
  }

  const displaySize: [number, number] = [bitmap.width, bitmap.height]

  // シーン全 ego pose の bitmap 上ピクセル範囲を計算
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const pose of mfc.egoPoses) {
    const [px, py] = egoPoseToPixel(pose.translation, location, displaySize)
    if (px < minX) minX = px
    if (px > maxX) maxX = px
    if (py < minY) minY = py
    if (py > maxY) maxY = py
  }

  // 40m 相当のマージン（bitmap ピクセル換算）
  const marginPx = (40 / meta.canvasEdge[0]) * bitmap.width
  const sx = Math.max(0, minX - marginPx)
  const sy = Math.max(0, minY - marginPx)
  const sw = Math.min(bitmap.width,  maxX + marginPx) - sx
  const sh = Math.min(bitmap.height, maxY + marginPx) - sy
  if (sw <= 0 || sh <= 0) {
    drawPlaceholder(ctx, cell, 'No Map')
    return
  }

  // contain-fit でセルに配置
  const cellScale = Math.min(cell.w / sw, cell.h / sh)
  const dx = (cell.w - sw * cellScale) / 2
  const dy = (cell.h - sh * cellScale) / 2

  ctx.save()
  ctx.translate(dx, dy)
  ctx.scale(cellScale, cellScale)
  ctx.translate(-sx, -sy)
  ctx.drawImage(bitmap, 0, 0)
  // drawEgoPoses は displaySize[0]/3000 で点サイズを決めるため、
  // transform の縮小分を dotRadiusPx で補正して見た目サイズを維持する
  drawEgoPoses(
    ctx, mfc.egoPoses, sampleIndex, displaySize, location,
    false, WAYPOINTS.SAMPLE_WAYPOINT_SIZE / cellScale,
  )
  ctx.restore()
}
