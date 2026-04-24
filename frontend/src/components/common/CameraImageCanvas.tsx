import { useEffect, useRef } from 'react'
import { useSensorImage } from '@/api/sensorData'
import { project3DTo2D, bboxCornersToGlobal, projectMapCoordsToCamera } from '@/lib/coordinateUtils'
import { drawBBox2D, drawProjectedPolygon, drawProjectedLine, drawProjectedPoint } from '@/lib/canvasUtils'
import { LAYER_COLORS } from '@/layers/MapAnnotationLayers'
import type { Annotation } from '@/types/annotation'
import type { CalibratedSensor } from '@/types/sensor'
import type { GeoJSONFeatureCollection, MapLayer } from '@/types/map'

interface CameraImageCanvasProps {
  sampleDataToken:  string
  calibratedSensor: CalibratedSensor
  egoPose?:         { translation: number[]; rotation: number[] }
  annotations?:     Annotation[]
  highlightInstanceToken?: string
  onBBoxClick?:     (token: string) => void
  mapLayerData?:    { layer: MapLayer; collection: GeoJSONFeatureCollection }[]
  location?:        string | null
  className?:       string
}

// ── Map フィーチャー投影ヘルパー ──────────────────────────────────────────────

type RGBA = [number, number, number, number]

function drawMapFeatureOnCanvas(
  ctx:         CanvasRenderingContext2D,
  geom:        { type: string; coordinates: unknown },
  color:       RGBA,
  location:    string,
  egoPose:     { translation: number[]; rotation: number[] },
  calibSensor: { translation: number[]; rotation: number[] },
  intrinsic:   number[][],
  imageSize:   [number, number],
  scaleX:      number,
  scaleY:      number,
): void {
  const project = (coords: [number, number][]): [number, number][] | null => {
    const proj = projectMapCoordsToCamera(coords, location, egoPose, calibSensor, intrinsic, imageSize)
    if (!proj) return null
    return proj.map(([u, v]) => [u * scaleX, v * scaleY] as [number, number])
  }

  switch (geom.type) {
    case 'Polygon': {
      const ring = (geom.coordinates as number[][][])[0] as [number, number][]
      const pts = project(ring)
      if (pts) drawProjectedPolygon(ctx, pts, color)
      break
    }
    case 'MultiPolygon': {
      for (const polygon of geom.coordinates as number[][][][]) {
        const ring = polygon[0] as [number, number][]
        const pts = project(ring)
        if (pts) drawProjectedPolygon(ctx, pts, color)
      }
      break
    }
    case 'LineString': {
      const pts = project(geom.coordinates as [number, number][])
      if (pts) drawProjectedLine(ctx, pts, color)
      break
    }
    case 'MultiLineString': {
      for (const line of geom.coordinates as number[][][]) {
        const pts = project(line as [number, number][])
        if (pts) drawProjectedLine(ctx, pts, color)
      }
      break
    }
    case 'Point': {
      const [lon, lat] = geom.coordinates as [number, number]
      const pts = project([[lon, lat]])
      if (pts && pts.length > 0) drawProjectedPoint(ctx, pts[0], color)
      break
    }
  }
}

// ── BBox の画面上 2D 矩形境界（クリック判定用）────────────────────────────────

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
  mapLayerData,
  location,
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
    const naturalWidth  = bitmapRef.current?.width  ?? 1
    const naturalHeight = bitmapRef.current?.height ?? 1

    // 元画像 → bboxCanvas（imgCanvas の CSS 表示サイズ）へのスケール
    const scaleX = imgRect.width  / naturalWidth
    const scaleY = imgRect.height / naturalHeight

    const intrinsic = calibratedSensor.camera_intrinsic
    const newBBoxRects: BBoxRect[] = []

    for (const ann of annotations) {
      const globalCorners = bboxCornersToGlobal(ann.translation, ann.rotation, ann.size)

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

    // ── Map フィーチャーをカメラ画像上に投影描画 ──────────────────────────────
    if (mapLayerData && mapLayerData.length > 0 && location && egoPose && calibratedSensor.camera_intrinsic) {
      const imageSize: [number, number] = [naturalWidth, naturalHeight]
      for (const { layer, collection } of mapLayerData) {
        const color = LAYER_COLORS[layer]
        for (const feature of collection.features) {
          const geom = feature.geometry
          if (!geom) continue
          drawMapFeatureOnCanvas(ctx, geom, color, location, egoPose, calibArray, calibratedSensor.camera_intrinsic, imageSize, scaleX, scaleY)
        }
      }
    }
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
  }, [annotations, egoPose, highlightInstanceToken, calibratedSensor, mapLayerData, location])

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
