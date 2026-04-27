import React, { useCallback, useEffect, useRef, useState } from 'react'
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
  highlightInstanceToken?: string
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
  highlightInstanceToken,
  onBBoxClick,
  location,
  pointSize,
  refSensorToken,
  className,
}: PointCloudCanvasProps) {
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const bboxRectsRef = useRef<BBoxRect[]>([])
  const [canvasSize, setCanvasSize] = useState(400)
  const [zoom, setZoom]             = useState(1.0)
  const [panOffset, setPanOffset]   = useState({ x: 0, y: 0 })
  const [cursor, setCursor]         = useState<string>('grab')
  const dragRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setCanvasSize(Math.min(width, height))
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // サンプル切り替え時にズーム・パンをリセット
  useEffect(() => {
    setZoom(1)
    setPanOffset({ x: 0, y: 0 })
  }, [sampleDataToken])

  const axesLimitMeters = 40

  const { data, isLoading, isError } = usePointCloud(sampleDataToken, refSensorToken)
  const { data: bitmap } = useBasemap(location ?? null)

  // ホイールズーム（passive: false でスクロール防止）
  // data を依存配列に含めることで、データ取得後に canvas がマウントされた際にリスナーを再登録する
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const ZOOM_FACTOR = e.deltaY < 0 ? 1.15 : 1 / 1.15
      const MIN_ZOOM = 0.2, MAX_ZOOM = 20
      setZoom((prev) => {
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev * ZOOM_FACTOR))
        const rect = canvas.getBoundingClientRect()
        const sz   = canvas.width
        const half = sz / 2
        const mx   = e.clientX - rect.left
        const my   = e.clientY - rect.top
        const oldScale = (sz / (axesLimitMeters * 2)) * prev
        const newScale = (sz / (axesLimitMeters * 2)) * next
        const inv = 1 / oldScale - 1 / newScale
        setPanOffset((p) => ({
          x: p.x + (my - half) * inv,
          y: p.y + (mx - half) * inv,
        }))
        return next
      })
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [data, axesLimitMeters])

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

    const viewParams: BevViewParams = {
      width:   size,
      height:  size,
      scale:   (size / (axesLimitMeters * 2)) * zoom,
      offsetX: panOffset.x,
      offsetY: panOffset.y,
    }

    // basemap 切り出し・回転描画（devkit の render_ego_centric_map() 相当）
    if (bitmap && egoPose && location) {
      const meta = NUSCENES_MAP_META[location]
      if (meta) {
        const { resolution } = meta
        const axesLimitPx = axesLimitMeters / resolution

        // yaw を先に計算（パン補正とクロップ中心調整に使用）
        const [w, qx, qy, qz] = egoPose.rotation
        const yaw = Math.atan2(2 * (w * qz + qx * qy), 1 - 2 * (qy * qy + qz * qz))

        // sensor frame → world frame → map pixel 座標への変換
        // globalToMapPixel: px = x/res, py = -y/res + canvasH_px
        // → Δpx = Δx/res,  Δpy = -Δy/res
        const cosYaw = Math.cos(yaw), sinYaw = Math.sin(yaw)
        const world_dx = panOffset.x * cosYaw - panOffset.y * sinYaw  // east 方向
        const world_dy = panOffset.x * sinYaw + panOffset.y * cosYaw  // north 方向

        const centerPixel = globalToMapPixel(
          egoPose.translation[0], egoPose.translation[1], location,
        )
        if (centerPixel) {
          const [cx_map, cy_map] = centerPixel

          // パンオフセットを map pixel 座標に反映（canvas translate は使わない）
          // BEV 表示系（sensor_x=下, sensor_y=右）と地図座標系（east=右, north=上）の
          // 90° ずれを吸収するため world_dx と world_dy を入れ替えて使用する
          const adj_cx = cx_map + world_dy / resolution   // ← world_dy で東西を制御
          const adj_cy = cy_map + world_dx / resolution   // ← world_dx で南北を制御（符号+）

          // bitmap はリサイズ済みの可能性があるためスケール係数を計算
          const origW  = meta.canvasEdge[0] / resolution
          const origH  = meta.canvasEdge[1] / resolution
          const scaleX = bitmap.width  / origW
          const scaleY = bitmap.height / origH

          // ズームに応じた表示半径（クランプなし → ズームアウトも basemap に反映）
          const effectivePx = axesLimitPx / zoom

          // √2 倍の範囲を切り出す（回転後のクリッピング防止）
          const cropSize = Math.ceil(effectivePx * Math.sqrt(2))

          const offscreen = new OffscreenCanvas(cropSize * 2, cropSize * 2)
          const offCtx    = offscreen.getContext('2d')!
          offCtx.drawImage(
            bitmap,
            (adj_cx - cropSize) * scaleX, (adj_cy - cropSize) * scaleY,
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
            cropSize - effectivePx, cropSize - effectivePx,
            effectivePx * 2,        effectivePx * 2,
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

        const color = ann.instance_token === highlightInstanceToken ? '#FFD700' : '#00FF88'
        drawBBox2D(ctx, corners2D, color)
      }
    }
    ctx.restore()  // 点群、BBox 描画後に restore して点群描画の座標系を元に戻す
    bboxRectsRef.current = newBBoxRects
  }, [data, bitmap, annotations, egoPose, lidarCalibSensor, highlightInstanceToken, location, pointSize, zoom, panOffset, axesLimitMeters])

  const hitTestBBox = useCallback((screenX: number, screenY: number): string | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const x      = (screenX - rect.left) * (canvas.width  / rect.width)
    const cy_inv = canvas.height - (screenY - rect.top) * (canvas.height / rect.height)
    for (const bbox of bboxRectsRef.current) {
      if (x >= bbox.minX && x <= bbox.maxX && cy_inv >= bbox.minY && cy_inv <= bbox.maxY)
        return bbox.token
    }
    return null
  }, [])

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY,
                        startPanX: panOffset.x, startPanY: panOffset.y }
    setCursor('grabbing')
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current) {
      const dx = e.clientX - dragRef.current.startX
      const dy = e.clientY - dragRef.current.startY
      const currentScale = (canvasSize / (axesLimitMeters * 2)) * zoom
      setPanOffset({
        x: dragRef.current.startPanX - dy / currentScale,   // drag up (dy<0) → panOffset.x 増加 → ego 上移動
        y: dragRef.current.startPanY - dx / currentScale,   // drag right (dx>0) → panOffset.y 減少 → ego 右移動
      })
    } else {
      const hit = hitTestBBox(e.clientX, e.clientY)
      setCursor(hit ? 'pointer' : 'grab')
    }
  }

  const handleMouseUp = () => {
    dragRef.current = null
    setCursor('grab')
  }

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onBBoxClick) return
    if (dragRef.current) return
    const token = hitTestBBox(e.clientX, e.clientY)
    if (token) onBBoxClick(token)
  }

  const containerStyle: React.CSSProperties = {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    width:          '100%',
    height:         '100%',
    background:     '#111',
    overflow:       'hidden',
  }

  if (isLoading) {
    return (
      <div ref={containerRef} className={className} style={{ ...containerStyle, color: '#888', fontSize: 12 }}>
        Loading point cloud...
      </div>
    )
  }

  if (isError) {
    return (
      <div ref={containerRef} className={className} style={{ ...containerStyle, color: '#f55', fontSize: 12 }}>
        Failed to load point cloud
      </div>
    )
  }

  return (
    <div ref={containerRef} className={className} style={containerStyle}>
      <canvas
        ref={canvasRef}
        style={{
          width:      canvasSize,
          height:     canvasSize,
          display:    'block',
          background: '#111',
          flexShrink: 0,
          cursor,
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
      />
    </div>
  )
}
