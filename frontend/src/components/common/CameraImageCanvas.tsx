import { useEffect, useRef } from 'react'
import { useSensorImage } from '@/api/sensorData'
import { project3DTo2D, bboxCornersToGlobal, projectMapCoordsToCamera } from '@/lib/coordinateUtils'
import { drawBBox2D, drawProjectedPolygon, drawProjectedLine, drawProjectedPoint, drawProjectedArrow, drawProjectedLabel } from '@/lib/canvasUtils'
import { LAYER_COLORS } from '@/layers/MapAnnotationLayers'
import { MAP_PROJECTION } from '@/config/settings'
import type { Annotation } from '@/types/annotation'
import type { CalibratedSensor } from '@/types/sensor'
import type { GeoJSONFeatureCollection, GeoJSONMapFeature, MapLayer } from '@/types/map'

// ── マップフィーチャー ヒットテスト ────────────────────────────────────────────

type ProjectedRegion = { points: [number, number][]; geoType: string }

interface ProjectedFeatureHit {
  feature: GeoJSONMapFeature
  layer:   MapLayer
  regions: ProjectedRegion[]
}

function pointInPolygon2D(px: number, py: number, poly: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (((yi > py) !== (yj > py)) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)
      inside = !inside
  }
  return inside
}

function distPointToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
  return Math.hypot(px - ax - t * dx, py - ay - t * dy)
}

function hitTestRegion(x: number, y: number, region: ProjectedRegion, threshold = 6): boolean {
  const { points: pts, geoType } = region
  if (geoType === 'polygon') return pointInPolygon2D(x, y, pts)
  if (geoType === 'line') {
    for (let i = 0; i < pts.length - 1; i++) {
      if (distPointToSegment(x, y, pts[i][0], pts[i][1], pts[i+1][0], pts[i+1][1]) < threshold) return true
    }
  }
  if (geoType === 'point' && pts.length > 0) return Math.hypot(x - pts[0][0], y - pts[0][1]) < threshold + 2
  return false
}

// ─────────────────────────────────────────────────────────────────────────────

interface CameraImageCanvasProps {
  sampleDataToken:  string
  calibratedSensor: CalibratedSensor
  egoPose?:         { translation: number[]; rotation: number[] }
  annotations?:     Annotation[]
  highlightInstanceToken?: string
  onBBoxClick?:     (token: string) => void
  onFeatureClick?:  (feature: GeoJSONMapFeature, layer: MapLayer) => void
  selectedFeature?: GeoJSONMapFeature | null
  mapLayerData?:    { layer: MapLayer; collection: GeoJSONFeatureCollection }[]
  location?:        string | null
  className?:       string
}

// ── Map フィーチャー投影ヘルパー ──────────────────────────────────────────────

type RGBA = [number, number, number, number]

const TL_ITEM_COLORS: Record<string, RGBA> = {
  RED:    [255, 60,  60,  255],
  GREEN:  [50,  220, 50,  255],
  YELLOW: [255, 220, 0,   255],
}

// TrafficLight の line（矢印）と items（個別ライト）をカメラ画像上に描画する
function drawTrafficLightExtras(
  ctx:         CanvasRenderingContext2D,
  props:       Record<string, unknown>,
  baseColor:   RGBA,
  project:     (coords: [number, number][]) => [number, number][] | null,
  egoPose:     { translation: number[]; rotation: number[] },
  calibSensor: { translation: number[]; rotation: number[] },
  intrinsic:   number[][],
  imageSize:   [number, number],
  scaleX:      number,
  scaleY:      number,
): void {
  const [imgW, imgH] = imageSize

  // 1. line を矢印で描画
  const lineGeom = props.line_geometry as { type: string; coordinates: unknown } | undefined
  if (lineGeom?.type === 'LineString') {
    const pts = project(lineGeom.coordinates as [number, number][])
    if (pts && pts.length >= 2) drawProjectedArrow(ctx, pts, baseColor)
  }

  // 2. items を個別描画（pose + rel_pos で絶対ローカル座標を計算して投影）
  const pose  = props.pose  as { tx: number; ty: number; tz: number; rz?: number | null } | undefined
  const items = props.items as Array<{
    color:   string
    shape:   string
    rel_pos: { tx: number; ty: number; tz: number }
  }> | undefined

  if (!pose || !items?.length) return

  // rel_pos は traffic light のローカルフレームでの相対座標。
  // nuScenes の pose.rz はパッシブ回転（座標フレームの回転角）なので、
  // body→world 変換には R_z(rz)^T（転置 = R_z(-rz)）を使う。
  const rz    = pose.rz ?? 0
  const cosRz = Math.cos(rz)
  const sinRz = Math.sin(rz)

  for (const item of items) {
    const worldPos = [
      pose.tx + item.rel_pos.tx * cosRz + item.rel_pos.ty * sinRz,
      pose.ty + item.rel_pos.tx * sinRz - item.rel_pos.ty * cosRz,
      pose.tz + item.rel_pos.tz,
    ]
    const uv = project3DTo2D(worldPos, intrinsic, egoPose, calibSensor)
    if (!uv) continue
    if (uv[0] < 0 || uv[0] > imgW || uv[1] < 0 || uv[1] > imgH) continue

    const px: [number, number]  = [uv[0] * scaleX, uv[1] * scaleY]
    const itemColor: RGBA = TL_ITEM_COLORS[item.color] ?? baseColor

    switch (item.shape) {
      case 'CIRCLE': drawProjectedPoint(ctx, px, itemColor, 6);         break
      case 'RIGHT':  drawProjectedLabel(ctx, px, 'R', itemColor);       break
      case 'LEFT':   drawProjectedLabel(ctx, px, 'L', itemColor);       break
      case 'UP':     drawProjectedLabel(ctx, px, 'U', itemColor);       break
      default:       drawProjectedPoint(ctx, px, itemColor, 4);         break
    }
  }
}

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
  properties?: Record<string, unknown>,
  outRegions?: ProjectedRegion[],
): void {
  const project = (coords: [number, number][], isPolygonRing = false): [number, number][] | null => {
    const proj = projectMapCoordsToCamera(coords, location, egoPose, calibSensor, intrinsic, imageSize, MAP_PROJECTION.MAX_DISTANCE_M, isPolygonRing)
    if (!proj) return null
    return proj.map(([u, v]) => [u * scaleX, v * scaleY] as [number, number])
  }

  switch (geom.type) {
    case 'Polygon': {
      const ring = (geom.coordinates as number[][][])[0] as [number, number][]
      const pts = project(ring, true)
      if (pts) {
        drawProjectedPolygon(ctx, pts, color)
        outRegions?.push({ points: pts, geoType: 'polygon' })
      }
      break
    }
    case 'MultiPolygon': {
      for (const polygon of geom.coordinates as number[][][][]) {
        const ring = polygon[0] as [number, number][]
        const pts = project(ring, true)
        if (pts) {
          drawProjectedPolygon(ctx, pts, color)
          outRegions?.push({ points: pts, geoType: 'polygon' })
        }
      }
      break
    }
    case 'LineString': {
      const pts = project(geom.coordinates as [number, number][])
      if (pts) {
        drawProjectedLine(ctx, pts, color)
        outRegions?.push({ points: pts, geoType: 'line' })
      }
      break
    }
    case 'MultiLineString': {
      for (const line of geom.coordinates as number[][][]) {
        const pts = project(line as [number, number][])
        if (pts) {
          drawProjectedLine(ctx, pts, color)
          outRegions?.push({ points: pts, geoType: 'line' })
        }
      }
      break
    }
    case 'Point': {
      const [lon, lat] = geom.coordinates as [number, number]
      const pts = project([[lon, lat]])
      if (pts && pts.length > 0) {
        drawProjectedPoint(ctx, pts[0], color)
        outRegions?.push({ points: [pts[0]], geoType: 'point' })
        if (properties?.layer === 'traffic_light') {
          drawTrafficLightExtras(ctx, properties, color, project, egoPose, calibSensor, intrinsic, imageSize, scaleX, scaleY)
        }
      }
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
  onFeatureClick,
  selectedFeature,
  mapLayerData,
  location,
  className,
}: CameraImageCanvasProps) {
  const containerRef          = useRef<HTMLDivElement>(null)
  const imgCanvasRef          = useRef<HTMLCanvasElement>(null)
  const bboxCanvasRef         = useRef<HTMLCanvasElement>(null)
  const bboxRectsRef          = useRef<BBoxRect[]>([])
  const projectedFeaturesRef  = useRef<ProjectedFeatureHit[]>([])
  const drawBBoxesRef         = useRef<(() => void) | null>(null)
  const bitmapRef             = useRef<ImageBitmap | null>(null)
  const offsetRef             = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  const { data: bitmap, isError } = useSensorImage(sampleDataToken)

  const drawBBoxes = () => {
    const imgCanvas  = imgCanvasRef.current
    const bboxCanvas = bboxCanvasRef.current
    const container  = containerRef.current
    if (!imgCanvas || !bboxCanvas || !container) return

    // contain モード: コンテナに収まる最大サイズを計算
    const containerW = container.clientWidth
    const containerH = container.clientHeight
    if (containerW === 0 || containerH === 0) return

    const naturalWidth  = bitmapRef.current?.width  ?? 1
    const naturalHeight = bitmapRef.current?.height ?? 1

    const scale    = Math.min(containerW / naturalWidth, containerH / naturalHeight)
    const displayW = naturalWidth  * scale
    const displayH = naturalHeight * scale
    const offsetX  = (containerW - displayW) / 2
    const offsetY  = (containerH - displayH) / 2

    // imgCanvas を中央に絶対配置
    imgCanvas.style.position = 'absolute'
    imgCanvas.style.left     = offsetX + 'px'
    imgCanvas.style.top      = offsetY + 'px'
    imgCanvas.style.width    = displayW + 'px'
    imgCanvas.style.height   = displayH + 'px'

    // bboxCanvas を imgCanvas と同じ位置・サイズに配置
    const dpr = window.devicePixelRatio || 1
    bboxCanvas.width          = displayW * dpr
    bboxCanvas.height         = displayH * dpr
    bboxCanvas.style.position = 'absolute'
    bboxCanvas.style.left     = offsetX + 'px'
    bboxCanvas.style.top      = offsetY + 'px'
    bboxCanvas.style.width    = displayW + 'px'
    bboxCanvas.style.height   = displayH + 'px'

    // クリック座標補正用にオフセットを保存
    offsetRef.current = { x: offsetX, y: offsetY }

    const ctx = bboxCanvas.getContext('2d')
    if (!ctx) return

    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, displayW, displayH)

    if (!annotations || !egoPose || !calibratedSensor.camera_intrinsic) return

    const calibArray = {
      translation: calibratedSensor.translation,
      rotation:    calibratedSensor.rotation,
    }

    // 元画像座標 → bboxCanvas 座標へのスケール
    const scaleX = displayW / naturalWidth
    const scaleY = displayH / naturalHeight

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
    const newProjectedFeatures: ProjectedFeatureHit[] = []
    if (mapLayerData && mapLayerData.length > 0 && location && egoPose && calibratedSensor.camera_intrinsic) {
      const imageSize: [number, number] = [naturalWidth, naturalHeight]
      const selectedToken = selectedFeature?.properties?.token

      for (const { layer, collection } of mapLayerData) {
        const color = LAYER_COLORS[layer]
        for (const feature of collection.features) {
          const geom = feature.geometry
          if (!geom) continue
          const regions: ProjectedRegion[] = []
          drawMapFeatureOnCanvas(ctx, geom, color, location, egoPose, calibArray, calibratedSensor.camera_intrinsic, imageSize, scaleX, scaleY, feature.properties, regions)

          // 選択中フィーチャーを白でハイライト
          if (selectedToken && feature.properties?.token === selectedToken) {
            drawMapFeatureOnCanvas(ctx, geom, [255, 238, 128, 170] as RGBA, location, egoPose, calibArray, calibratedSensor.camera_intrinsic, imageSize, scaleX, scaleY, feature.properties)
          }

          if (regions.length > 0) {
            newProjectedFeatures.push({ feature: feature as GeoJSONMapFeature, layer, regions })
          }
        }
      }
    }
    projectedFeaturesRef.current = newProjectedFeatures
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

  // annotations / egoPose / highlight / 選択フィーチャー 変化時に再描画
  useEffect(() => {
    if (bitmapRef.current) {
      drawBBoxesRef.current?.()
    }
  }, [annotations, egoPose, highlightInstanceToken, calibratedSensor, mapLayerData, location, selectedFeature])

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left - offsetRef.current.x
    const y = e.clientY - rect.top  - offsetRef.current.y

    // BBox クリック判定（優先）
    if (onBBoxClick) {
      for (const bbox of bboxRectsRef.current) {
        if (x >= bbox.minX && x <= bbox.maxX && y >= bbox.minY && y <= bbox.maxY) {
          onBBoxClick(bbox.token)
          return
        }
      }
    }

    // Map フィーチャークリック判定
    if (onFeatureClick) {
      for (const { feature, layer, regions } of projectedFeaturesRef.current) {
        for (const region of regions) {
          if (hitTestRegion(x, y, region)) {
            onFeatureClick(feature, layer)
            return
          }
        }
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
      style={{ position: 'relative', overflow: 'hidden' }}
      onClick={handleClick}
    >
      <canvas
        ref={imgCanvasRef}
        style={{ display: 'block' }}
      />
      <canvas
        ref={bboxCanvasRef}
        style={{ pointerEvents: 'none' }}
      />
    </div>
  )
}
