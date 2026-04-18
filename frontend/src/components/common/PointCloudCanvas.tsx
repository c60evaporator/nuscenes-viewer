import { useEffect, useRef } from 'react'
import { usePointCloud } from '@/api/sensorData'
import { useBasemap } from '@/api/maps'
import { drawPointCloud, drawBBox2D, type BevViewParams } from '@/lib/canvasUtils'
import { bboxCornersToGlobal, globalToSensor, globalToMapPixel, NUSCENES_MAP_META } from '@/lib/coordinateUtils'
import type { Annotation } from '@/types/annotation'
import type { EgoPosePoint } from '@/types/sensor'

interface PointCloudCanvasProps {
  sampleDataToken:    string
  annotations?:       Annotation[]
  egoPose?:           EgoPosePoint
  lidarCalibSensor?:  { translation: number[]; rotation: number[] }
  highlightAnnToken?: string
  onBBoxClick?:       (token: string) => void
  location?:          string | null
  pointSize?:         number
  refSensorToken?:    string | null
  className?:         string
}

// BBox の 2D 矩形境界（クリック判定用）
interface BBoxRect {
  token:  string
  minX:   number
  minY:   number
  maxX:   number
  maxY:   number
}

export default function PointCloudCanvas({
  sampleDataToken,
  annotations,
  egoPose,
  lidarCalibSensor,
  highlightAnnToken,
  onBBoxClick,
  location,
  pointSize,
  refSensorToken,
  className,
}: PointCloudCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bboxRectsRef = useRef<BBoxRect[]>([])

  const { data, isLoading, isError } = usePointCloud(sampleDataToken, refSensorToken)
  const { data: bitmap } = useBasemap(location ?? null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !data) return

    const size = canvas.clientWidth || 400
    canvas.width  = size
    canvas.height = size

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // 黒背景
    ctx.fillStyle = '#111'
    ctx.fillRect(0, 0, size, size)

    const points = data.points

    // devkit の axes_limit=40 相当の固定表示範囲
    const axesLimitMeters = 40
    const viewParams: BevViewParams = {
      width:   size,
      height:  size,
      scale:   size / (axesLimitMeters * 2),
      offsetX: 0,
      offsetY: 0,
    }

    // basemap 切り出し・回転描画（devkit の render_ego_centric_map() 相当）
    if (bitmap && egoPose && location) {
      const meta = NUSCENES_MAP_META[location]
      if (meta) {
        const { resolution } = meta
        const axesLimitPx = axesLimitMeters / resolution   // 400px

        const centerPixel = globalToMapPixel(
          egoPose.translation[0], egoPose.translation[1], location,
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

          // yaw 角で回転（車両前方が上になるように）
          const [w, qx, qy, qz] = egoPose.rotation
          const yaw = Math.atan2(2 * (w * qz + qx * qy), 1 - 2 * (qy * qy + qz * qz))

          const rotCanvas = new OffscreenCanvas(cropSize * 2, cropSize * 2)
          const rotCtx    = rotCanvas.getContext('2d')!
          rotCtx.translate(cropSize, cropSize)
          // 画像中心を回転中心にして ego yaw を適用
          rotCtx.rotate(yaw)
          // 原点を左上に戻して回転後の画像を描画
          rotCtx.translate(-cropSize, -cropSize)
          rotCtx.drawImage(offscreen, 0, 0)

          // 中央から axesLimitPx 範囲を再切り出してメイン canvas に半透明で描画
          ctx.globalAlpha = 0.5
          ctx.drawImage(
            rotCanvas,
            cropSize - axesLimitPx, cropSize - axesLimitPx,
            axesLimitPx * 2,        axesLimitPx * 2,
            0, 0, size, size,
          )
          ctx.globalAlpha = 1.0
        }
      }
    }
    // 点群描画（Y軸反転して地図の座標系に合わせる）
    ctx.save()
    ctx.translate(0, size)   // Y軸の基点を下端に移動
    ctx.scale(1, -1)         // Y軸反転
    drawPointCloud(ctx, points, viewParams, {
      pointSize: pointSize ?? 2,
      colorMode: 'intensity',
    })

    // BBox 描画（egoPose と lidarCalibSensor が揃っている場合のみ）
    const newBBoxRects: BBoxRect[] = []
    if (annotations && egoPose && lidarCalibSensor) {
      const { width, height, scale, offsetX, offsetY } = viewParams
      const cx = width  / 2
      const cy = height / 2

      const toPixel = (x: number, y: number): [number, number] => [
        cx + (y - offsetY) * scale,
        cy - (x - offsetX) * scale,
      ]

      for (const ann of annotations) {
        const globalCorners = bboxCornersToGlobal(ann.translation, ann.rotation, ann.size)
        const corners2D = globalCorners.map((corner) => {
          const sensorPt = globalToSensor(corner, egoPose, lidarCalibSensor)
          return toPixel(sensorPt[0], sensorPt[1])
        }) as [number, number][]

        const allX = corners2D.map((c) => c[0])
        const allY = corners2D.map((c) => c[1])
        newBBoxRects.push({
          token: ann.token,
          minX:  Math.min(...allX),
          minY:  Math.min(...allY),
          maxX:  Math.max(...allX),
          maxY:  Math.max(...allY),
        })

        const color = ann.token === highlightAnnToken ? '#FFD700' : '#00FF88'
        drawBBox2D(ctx, corners2D, color)
      }
    }
    ctx.restore()  // 点群、BBox 描画後に restore して点群描画の座標系を元に戻す
    bboxRectsRef.current = newBBoxRects
  }, [data, bitmap, annotations, egoPose, lidarCalibSensor, highlightAnnToken, location, pointSize])

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onBBoxClick) return
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const scale = canvasRef.current!.width / rect.width

    for (const bbox of bboxRectsRef.current) {
      if (x * scale >= bbox.minX && x * scale <= bbox.maxX &&
          y * scale >= bbox.minY && y * scale <= bbox.maxY) {
        onBBoxClick(bbox.token)
        break
      }
    }
  }

  if (isLoading) {
    return (
      <div className={className} style={{ aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111', color: '#888', fontSize: 12 }}>
        Loading point cloud...
      </div>
    )
  }

  if (isError) {
    return (
      <div className={className} style={{ aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111', color: '#f55', fontSize: 12 }}>
        Failed to load point cloud
      </div>
    )
  }

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ aspectRatio: '1', width: '100%', background: '#111', display: 'block' }}
      onClick={handleClick}
    />
  )
}
