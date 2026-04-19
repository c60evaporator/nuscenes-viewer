import { useEffect, useRef } from 'react'
import { useSensorImage } from '@/api/sensorData'
import { project3DTo2D, bboxCornersToGlobal } from '@/lib/coordinateUtils'
import { drawBBox2D } from '@/lib/canvasUtils'
import type { Annotation } from '@/types/annotation'
import type { CalibratedSensor } from '@/types/sensor'

interface CameraImageCanvasProps {
  sampleDataToken:  string
  calibratedSensor: CalibratedSensor
  egoPose?:         { translation: number[]; rotation: number[] }
  annotations?:     Annotation[]
  highlightInstanceToken?: string
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
  highlightInstanceToken,
  onBBoxClick,
  className,
}: CameraImageCanvasProps) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const imgCanvasRef  = useRef<HTMLCanvasElement>(null)
  const bboxCanvasRef = useRef<HTMLCanvasElement>(null)
  const bboxRectsRef  = useRef<BBoxRect[]>([])
  const drawBBoxesRef = useRef<(() => void) | null>(null)
  const bitmapRef     = useRef<ImageBitmap | null>(null)

  const { data: bitmap, isError } = useSensorImage(sampleDataToken)

  const drawBBoxes = () => {
    const imgCanvas  = imgCanvasRef.current
    const bboxCanvas = bboxCanvasRef.current
    if (!imgCanvas || !bboxCanvas) return

    // imgCanvas の実際の CSS 表示サイズを取得
    const imgRect = imgCanvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1

    bboxCanvas.width        = imgRect.width  * dpr
    bboxCanvas.height       = imgRect.height * dpr
    bboxCanvas.style.width  = imgRect.width  + 'px'
    bboxCanvas.style.height = imgRect.height + 'px'

    const ctx = bboxCanvas.getContext('2d')
    if (!ctx) return

    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, imgRect.width, imgRect.height)

    if (!annotations || !egoPose || !calibratedSensor.camera_intrinsic) return

    const calibArray = {
      translation: calibratedSensor.translation,
      rotation:    calibratedSensor.rotation,
    }
    console.log('[BBox] egoPose.translation:', egoPose?.translation)

    const naturalWidth  = bitmapRef.current?.width  ?? 1
    const naturalHeight = bitmapRef.current?.height ?? 1

    // 元画像 → bboxCanvas（imgCanvas の CSS 表示サイズ）へのスケール
    const scaleX = imgRect.width  / naturalWidth
    const scaleY = imgRect.height / naturalHeight

    const intrinsic = calibratedSensor.camera_intrinsic
    const newBBoxRects: BBoxRect[] = []

    for (const ann of annotations) {
      const globalCorners = bboxCornersToGlobal(ann.translation, ann.rotation, ann.size)

      if (ann === annotations[0]) {
        console.log('[Debug] channel:', calibratedSensor.channel)
        console.log('[Debug] ann.translation:', ann.translation)
        console.log('[Debug] ann.rotation:', ann.rotation)
        console.log('[Debug] ann.size:', ann.size)
        console.log('[Debug] globalCorners[0]:', globalCorners[0])
        console.log('[Debug] egoPose.translation:', egoPose?.translation)
        console.log('[Debug] egoPose.rotation:', egoPose?.rotation)
        console.log('[Debug] calibArray.translation:', calibArray.translation)
        console.log('[Debug] calibArray.rotation:', calibArray.rotation)
        const px = project3DTo2D(globalCorners[0], intrinsic, egoPose!, calibArray)
        console.log('[Debug] projected corner0:', px)
      }

      const corners2D: [number, number][] = []
      for (const corner of globalCorners) {
        const px = project3DTo2D(corner, intrinsic, egoPose, calibArray)
        if (px !== null) {
          corners2D.push([px[0] * scaleX, px[1] * scaleY])
        }
      }

      if (corners2D.length < 4) continue

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

      const color = ann.instance_token === highlightInstanceToken ? '#FFFF00' : '#00AAFF'
      drawBBox2D(ctx, corners2D, color)
    }

    bboxRectsRef.current = newBBoxRects
  }

  drawBBoxesRef.current = drawBBoxes

  // リサイズ時に BBox を再描画
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => {
      if (bitmapRef.current) {
        drawBBoxesRef.current?.()
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // bitmap が届いたら画像 canvas に描画して BBox も重ねる
  useEffect(() => {
    bitmapRef.current = bitmap ?? null
    const imgCanvas = imgCanvasRef.current
    if (!imgCanvas) return

    const ctx = imgCanvas.getContext('2d')
    if (!ctx) return

    if (!bitmap) {
      ctx.clearRect(0, 0, imgCanvas.width, imgCanvas.height)
      return
    }

    imgCanvas.width  = bitmap.width
    imgCanvas.height = bitmap.height
    ctx.drawImage(bitmap, 0, 0)
    drawBBoxesRef.current?.()
  }, [bitmap])

  // annotations / egoPose / highlight 変化時に BBox を再描画
  useEffect(() => {
    if (bitmapRef.current) {
      drawBBoxesRef.current?.()
    }
  }, [annotations, egoPose, highlightInstanceToken, calibratedSensor])

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

  if (isError) {
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
      <canvas
        ref={imgCanvasRef}
        style={{ width: '100%', display: 'block' }}
      />
      <canvas
        ref={bboxCanvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      />
    </div>
  )
}
