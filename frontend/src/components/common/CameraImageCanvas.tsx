import { useEffect, useRef, useState, useLayoutEffect } from 'react'
import { useSensorImage } from '@/api/sensorData'
import { project3DTo2D, projectMapCoordsToCamera } from '@/lib/coordinateUtils'
import { computeCameraViewLayout, applyCameraWheelZoom, clampCameraPan } from '@/lib/cameraViewTransform'
import type { CameraViewLayout } from '@/lib/cameraViewTransform'
import { drawCameraBBoxes, drawProjectedPolygon, drawProjectedLine, drawProjectedPoint, drawProjectedArrow, drawProjectedLabel } from '@/lib/canvasUtils'
import type { CameraBBoxRect } from '@/lib/canvasUtils'
import { LAYER_COLORS } from '@/layers/MapAnnotationLayers'
import { MAP_PROJECTION, ANNOTATION } from '@/config/settings'
import type { Annotation } from '@/types/annotation'
import type { CalibratedSensor } from '@/types/sensor'
import type { GeoJSONFeatureCollection, GeoJSONMapFeature, MapLayer } from '@/types/map'
import EditingBBoxCameraLayer from './EditingBBoxCameraLayer'

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
  editingInstanceToken?:   string
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

export default function CameraImageCanvas({
  sampleDataToken,
  calibratedSensor,
  egoPose,
  annotations,
  highlightInstanceToken,
  editingInstanceToken,
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
  const [layout, setLayout]   = useState<CameraViewLayout | null>(null)
  const bboxRectsRef          = useRef<CameraBBoxRect[]>([])
  const projectedFeaturesRef  = useRef<ProjectedFeatureHit[]>([])
  const drawBBoxesRef         = useRef<(() => void) | null>(null)
  const bitmapRef             = useRef<ImageBitmap | null>(null)
  const offsetRef             = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  // パン・ズーム状態
  const [view, setView]           = useState({ zoom: 1, pan: { x: 0, y: 0 } })
  const [isDragging, setIsDragging] = useState(false)
  const dragRef  = useRef<{ startX: number; startY: number; startPan: { x: number; y: number } } | null>(null)
  const movedRef = useRef(false)  // ドラッグが5pxを超えたらtrue（クリック選択の抑止用）

  const { data: bitmap, isError } = useSensorImage(sampleDataToken)

  // サンプル/チャンネル切替でズーム・パンをリセット（派生 state）
  const [prevToken, setPrevToken] = useState(sampleDataToken)
  if (prevToken !== sampleDataToken) {
    setPrevToken(sampleDataToken)
    setView({ zoom: 1, pan: { x: 0, y: 0 } })
  }

  const drawBBoxes = () => {
    const imgCanvas  = imgCanvasRef.current
    const bboxCanvas = bboxCanvasRef.current
    const container  = containerRef.current
    if (!imgCanvas || !bboxCanvas || !container) return

    // contain フィット + zoom/pan からレイアウトを計算
    const containerW = container.clientWidth
    const containerH = container.clientHeight
    if (containerW === 0 || containerH === 0) return

    const naturalWidth  = bitmapRef.current?.width  ?? 1
    const naturalHeight = bitmapRef.current?.height ?? 1

    const l = computeCameraViewLayout(containerW, containerH, naturalWidth, naturalHeight, view.zoom, view.pan)
    const { displayW, displayH, offsetX, offsetY, scaleX, scaleY } = l

    // imgCanvas を絶対配置（バッファは原寸のままCSSで拡縮。コンテナのoverflow:hiddenではみ出しをクリップ）
    imgCanvas.style.position = 'absolute'
    imgCanvas.style.left     = offsetX + 'px'
    imgCanvas.style.top      = offsetY + 'px'
    imgCanvas.style.width    = displayW + 'px'
    imgCanvas.style.height   = displayH + 'px'

    // bboxCanvas はコンテナサイズ固定（高ズーム時のバッファ肥大を防ぐ）、描画時に translate で位置合わせ
    const dpr = window.devicePixelRatio || 1
    bboxCanvas.width          = containerW * dpr
    bboxCanvas.height         = containerH * dpr
    bboxCanvas.style.position = 'absolute'
    bboxCanvas.style.left     = '0px'
    bboxCanvas.style.top      = '0px'
    bboxCanvas.style.width    = containerW + 'px'
    bboxCanvas.style.height   = containerH + 'px'

    // クリック座標補正用にオフセットを保存
    offsetRef.current = { x: offsetX, y: offsetY }

    const ctx = bboxCanvas.getContext('2d')
    if (!ctx) return

    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, containerW, containerH)
    ctx.translate(offsetX, offsetY)

    setLayout(l)

    if (!annotations || !egoPose || !calibratedSensor.camera_intrinsic) return

    const calibArray = {
      translation: calibratedSensor.translation,
      rotation:    calibratedSensor.rotation,
    }

    const intrinsic = calibratedSensor.camera_intrinsic

    bboxRectsRef.current = drawCameraBBoxes(
      ctx, annotations, egoPose, calibArray, intrinsic, scaleX, scaleY,
      {
        colorFor: (ann) =>
          ann.instance_token === editingInstanceToken
            ? '#FF8C00'
            : ann.instance_token === highlightInstanceToken
              ? '#FFFF00'
              : '#4ADE80',
        alphaFor: (ann) =>
          ann.instance_token === editingInstanceToken
            ? ANNOTATION.EDITING_ORIGINAL_OPACITY
            : 1.0,
      },
    )

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

  useLayoutEffect(() => { drawBBoxesRef.current = drawBBoxes })

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

  // annotations / egoPose / highlight / 選択フィーチャー / ビュー 変化時に再描画。
  // useLayoutEffect でペイント前に imgCanvas CSS・bboxCanvas・layout（→Konvaレイヤー）を
  // 同時に確定させ、パン・ズーム中にオーバーレイが1フレーム遅れて見えるのを防ぐ
  useLayoutEffect(() => {
    if (bitmapRef.current) {
      drawBBoxesRef.current?.()
    }
  }, [annotations, egoPose, highlightInstanceToken, editingInstanceToken, calibratedSensor, mapLayerData, location, selectedFeature, view])

  // ホイールズーム（preventDefault が必要なため non-passive の native リスナーで登録）
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const bmp = bitmapRef.current
      if (!bmp) return
      const rect = el.getBoundingClientRect()
      setView((prev) => applyCameraWheelZoom(
        prev,
        e.clientX - rect.left, e.clientY - rect.top, e.deltaY,
        el.clientWidth, el.clientHeight, bmp.width, bmp.height,
      ))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [isError])

  // ドラッグパン
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragRef.current  = { startX: e.clientX, startY: e.clientY, startPan: view.pan }
    movedRef.current = false
    setIsDragging(true)
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    const el   = containerRef.current
    const bmp  = bitmapRef.current
    if (!drag || !el || !bmp) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    if (!movedRef.current && Math.hypot(dx, dy) <= 5) return
    movedRef.current = true
    const l = computeCameraViewLayout(el.clientWidth, el.clientHeight, bmp.width, bmp.height, view.zoom, view.pan)
    const pan = clampCameraPan(
      { x: drag.startPan.x + dx, y: drag.startPan.y + dy },
      el.clientWidth, el.clientHeight, l.displayW, l.displayH,
    )
    setView((prev) => ({ ...prev, pan }))
  }

  const handleMouseUp = () => {
    dragRef.current = null
    setIsDragging(false)
  }

  const handleDoubleClick = () => {
    setView({ zoom: 1, pan: { x: 0, y: 0 } })
  }

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // ドラッグ（パン）直後の click は選択として扱わない
    if (movedRef.current) {
      movedRef.current = false
      return
    }
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

    // Map フィーチャークリック判定（上位レイヤーを優先するため逆順走査）
    if (onFeatureClick) {
      const features = projectedFeaturesRef.current
      for (let i = features.length - 1; i >= 0; i--) {
        const { feature, layer, regions } = features[i]
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
      style={{
        position: 'relative',
        overflow: 'hidden',
        cursor: view.zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : undefined,
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <canvas
        ref={imgCanvasRef}
        style={{ display: 'block' }}
      />
      <canvas
        ref={bboxCanvasRef}
        style={{ pointerEvents: 'none' }}
      />
      {layout && (
        <EditingBBoxCameraLayer
          {...layout}
          calibratedSensor={calibratedSensor}
          egoPose={egoPose}
        />
      )}
    </div>
  )
}
