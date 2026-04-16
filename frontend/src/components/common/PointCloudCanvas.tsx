import { useEffect, useRef } from 'react'
import { usePointCloud } from '@/api/sensorData'
import { drawPointCloud, drawBBox2D, type BevViewParams } from '@/lib/canvasUtils'
import { bboxCornersToGlobal, globalToSensor } from '@/lib/coordinateUtils'
import type { Annotation } from '@/types/annotation'
import type { EgoPosePoint } from '@/types/sensor'

interface PointCloudCanvasProps {
  sampleDataToken:    string
  annotations?:       Annotation[]
  egoPose?:           EgoPosePoint
  lidarCalibSensor?:  { translation: number[]; rotation: number[] }
  highlightAnnToken?: string
  onBBoxClick?:       (token: string) => void
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
  className,
}: PointCloudCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bboxRectsRef = useRef<BBoxRect[]>([])

  const { data, isLoading, isError } = usePointCloud(sampleDataToken)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !data) return

    const size = canvas.clientWidth || 400
    canvas.width  = size
    canvas.height = size

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, size, size)

    const points = data.points

    // BEV 描画パラメータ: 点群の x/y 範囲から計算
    let viewParams: BevViewParams
    if (points.length > 0) {
      const xs = points.map((p) => p[0])
      const ys = points.map((p) => p[1])
      const minX = Math.min(...xs)
      const maxX = Math.max(...xs)
      const minY = Math.min(...ys)
      const maxY = Math.max(...ys)
      const rangeX = maxX - minX || 1
      const rangeY = maxY - minY || 1
      const padding = 20
      const scale = Math.min((size - padding * 2) / rangeX, (size - padding * 2) / rangeY)
      viewParams = {
        width:   size,
        height:  size,
        scale,
        offsetX: (minX + maxX) / 2,
        offsetY: (minY + maxY) / 2,
      }
    } else {
      viewParams = { width: size, height: size, scale: 10, offsetX: 0, offsetY: 0 }
    }

    drawPointCloud(ctx, points, viewParams)

    // BBox 描画（egoPose と lidarCalibSensor が揃っている場合のみ）
    const newBBoxRects: BBoxRect[] = []
    if (annotations && egoPose && lidarCalibSensor) {
      const { width, height, scale, offsetX, offsetY } = viewParams
      const cx = width  / 2
      const cy = height / 2

      const toPixel = (x: number, y: number): [number, number] => [
        cx + (y - offsetY) * scale,   // y → 画面 x
        cy - (x - offsetX) * scale,   // x → 画面 y（反転）
      ]

      for (const ann of annotations) {
        // グローバル8頂点 → センサー系 → BEV ピクセル
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
    bboxRectsRef.current = newBBoxRects
  }, [data, annotations, egoPose, lidarCalibSensor, highlightAnnToken])

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
