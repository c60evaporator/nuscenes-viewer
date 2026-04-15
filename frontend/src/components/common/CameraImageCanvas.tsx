import { useRef, useState } from 'react'
import { imageUrl } from '@/api/sensorData'
import { project3DTo2D, bboxCornersToGlobal } from '@/lib/coordinateUtils'
import { drawBBox2D } from '@/lib/canvasUtils'
import type { Annotation } from '@/types/annotation'
import type { CalibratedSensor, EgoPosePoint } from '@/types/sensor'

interface CameraImageCanvasProps {
  sampleDataToken:  string
  calibratedSensor: CalibratedSensor
  egoPose?:         EgoPosePoint
  annotations?:     Annotation[]
  highlightToken?:  string
  onBBoxClick?:     (token: string) => void
  className?:       string
}

// BBox の画面上 2D 矩形境界（クリック判定用）
interface BBoxRect {
  token: string
  minX:  number
  minY:  number
  maxX:  number
  maxY:  number
}

export default function CameraImageCanvas({
  sampleDataToken,
  calibratedSensor,
  egoPose,
  annotations,
  highlightToken,
  onBBoxClick,
  className,
}: CameraImageCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef       = useRef<HTMLImageElement>(null)
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const bboxRectsRef = useRef<BBoxRect[]>([])
  const [imgError, setImgError] = useState(false)

  const drawBBoxes = () => {
    const img    = imgRef.current
    const canvas = canvasRef.current
    if (!img || !canvas) return

    // レンダリングサイズに合わせる
    const { width, height } = img.getBoundingClientRect()
    canvas.width  = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, width, height)

    if (!annotations || !egoPose || !calibratedSensor.camera_intrinsic) return

    // CalibratedSensor: Point3D/Quaternion 構造体 → 配列形式に変換
    const calibArray = {
      translation: [
        calibratedSensor.translation.x,
        calibratedSensor.translation.y,
        calibratedSensor.translation.z,
      ],
      rotation: [
        calibratedSensor.rotation.w,
        calibratedSensor.rotation.x,
        calibratedSensor.rotation.y,
        calibratedSensor.rotation.z,
      ],
    }

    // 自然サイズとレンダリングサイズの比（座標スケーリング用）
    const scaleX = width  / img.naturalWidth
    const scaleY = height / img.naturalHeight

    const intrinsic = calibratedSensor.camera_intrinsic
    const newBBoxRects: BBoxRect[] = []

    for (const ann of annotations) {
      const globalCorners = bboxCornersToGlobal(ann.translation, ann.rotation, ann.size)

      const corners2D: [number, number][] = []
      for (const corner of globalCorners) {
        const px = project3DTo2D(corner, intrinsic, egoPose, calibArray)
        if (px !== null) {
          // 自然座標 → レンダリングサイズ座標
          corners2D.push([px[0] * scaleX, px[1] * scaleY])
        }
      }

      if (corners2D.length < 4) continue

      // 8頂点に満たない場合は残りを補完（最後の点で埋める）
      while (corners2D.length < 8) corners2D.push(corners2D[corners2D.length - 1])

      const allX = corners2D.map((c) => c[0])
      const allY = corners2D.map((c) => c[1])
      newBBoxRects.push({
        token: ann.token,
        minX:  Math.min(...allX),
        minY:  Math.min(...allY),
        maxX:  Math.max(...allX),
        maxY:  Math.max(...allY),
      })

      const isHighlighted = ann.token === highlightToken
      const color = isHighlighted ? '#FFFF00' : '#00AAFF'
      drawBBox2D(ctx, corners2D, color)
    }

    bboxRectsRef.current = newBBoxRects
  }

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onBBoxClick) return
    const rect = containerRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    for (const bbox of bboxRectsRef.current) {
      if (x >= bbox.minX && x <= bbox.maxX && y >= bbox.minY && y <= bbox.maxY) {
        onBBoxClick(bbox.token)
        break
      }
    }
  }

  if (imgError) {
    return (
      <div className={className} style={{ background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f55', fontSize: 12 }}>
        Failed to load image
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: 'relative', display: 'inline-block', width: '100%' }}
      onClick={handleClick}
    >
      <img
        ref={imgRef}
        src={imageUrl(sampleDataToken)}
        alt="Camera view"
        style={{ width: '100%', display: 'block' }}
        onLoad={drawBBoxes}
        onError={() => setImgError(true)}
      />
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      />
    </div>
  )
}
