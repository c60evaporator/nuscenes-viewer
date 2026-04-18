import { useEffect, useRef, useState } from 'react'
import { useBasemap } from '@/api/maps'
import { drawEgoPoses } from '@/lib/canvasUtils'
import { egoPoseToPixel, NUSCENES_MAP_META } from '@/lib/coordinateUtils'
import type { EgoPosePoint } from '@/types/sensor'

interface MapCanvasProps {
  location:       string
  egoPoses:       EgoPosePoint[]
  currentIndex?:  number                   // 強調する点のインデックス（デフォルト -1）
  cropToContent?: boolean                  // ego pose 範囲に自動ズーム（デフォルト false）
  showStartEnd?:  boolean                  // Start/End ラベル（デフォルト true）
  centerPoint?:   [number, number] | null  // センタリングしたいメートル座標 [x, y]
  className?:     string
}

export default function MapCanvas({
  location,
  egoPoses,
  currentIndex  = -1,
  cropToContent = false,
  showStartEnd  = true,
  centerPoint,
  className,
}: MapCanvasProps) {
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const [zoom, setZoom]               = useState(1)
  const [offset, setOffset]           = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging]   = useState(false)
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })
  const { data: bitmap } = useBasemap(location)

  // zoom を ref でも保持（centerPoint effect から stale closure なしで参照するため）
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom

  // コンテナサイズを ResizeObserver で監視
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      if (width > 0 && height > 0) setContainerSize({ w: width, h: height })
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // ズーム変更時にアンカー点が動かないようオフセットを補正する
  const applyZoom = (newZoom: number, anchorX: number, anchorY: number) => {
    const ratio = newZoom / zoom
    setZoom(newZoom)
    setOffset({
      x: anchorX - (anchorX - offset.x) * ratio,
      y: anchorY - (anchorY - offset.y) * ratio,
    })
  }

  // basemap + ego poses を単一 canvas に描画
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    if (!bitmap) return

    canvas.width  = bitmap.width
    canvas.height = bitmap.height
    ctx.drawImage(bitmap, 0, 0)

    if (egoPoses.length === 0) return

    const displaySize: [number, number] = [bitmap.width, bitmap.height]

    if (egoPoses.length > 0) {
      const meta = NUSCENES_MAP_META[location]
      console.log('[MapCanvas] location:', location)
      console.log('[MapCanvas] canvasEdge:', meta?.canvasEdge)
      console.log('[MapCanvas] displaySize:', displaySize)
      console.log('[MapCanvas] first translation:', egoPoses[0].translation)
      console.log('[MapCanvas] first pixel:', egoPoseToPixel(egoPoses[0].translation, location, displaySize))
    }

    drawEgoPoses(ctx, egoPoses, currentIndex, displaySize, location, showStartEnd)
  }, [bitmap, egoPoses, currentIndex, showStartEnd, location])

  // cropToContent: ego poses の範囲にズームし、重心をコンテナ中央にセンタリング
  useEffect(() => {
    if (!cropToContent || egoPoses.length === 0 || !bitmap) return
    if (containerSize.w === 0 || containerSize.h === 0) return

    const displaySize: [number, number] = [bitmap.width, bitmap.height]
    const pixels = egoPoses.map((p) => egoPoseToPixel(p.translation, location, displaySize))
    const pxs    = pixels.map(([px]) => px)
    const pys    = pixels.map(([, py]) => py)
    const minX = Math.min(...pxs), maxX = Math.max(...pxs)
    const minY = Math.min(...pys), maxY = Math.max(...pys)
    const rangeX = (maxX - minX) || 1
    const rangeY = (maxY - minY) || 1

    const padding = 40
    const scaleX  = (bitmap.width  - padding * 2) / rangeX
    const scaleY  = (bitmap.height - padding * 2) / rangeY
    const newZoom = Math.min(Math.min(scaleX, scaleY), 5)
    setZoom(newZoom)

    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const { w: cW, h: cH } = containerSize
    setOffset({
      x: cW / 2 - cx * newZoom,
      y: cH / 2 - cy * newZoom,
    })
  }, [cropToContent, egoPoses, bitmap, location, containerSize])

  // centerPoint: 指定座標をコンテナ中央に合わせる（cropToContent=true のときは cropToContent が担うため除外）
  useEffect(() => {
    if (!centerPoint || !bitmap || cropToContent) return
    if (containerSize.w === 0 || containerSize.h === 0) return
    const [cx, cy] = egoPoseToPixel(
      [centerPoint[0], centerPoint[1], 0],
      location,
      [bitmap.width, bitmap.height],
    )
    setOffset({
      x: containerSize.w / 2 - cx * zoomRef.current,
      y: containerSize.h / 2 - cy * zoomRef.current,
    })
  }, [centerPoint, bitmap, location, cropToContent, containerSize])

  // location 変更時にズーム・オフセットをリセット
  useEffect(() => {
    setOffset({ x: 0, y: 0 })
    setZoom(1)
  }, [location])

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    dragStartRef.current = { x: e.clientX - offset.x, y: e.clientY - offset.y }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    setOffset({ x: e.clientX - dragStartRef.current.x, y: e.clientY - dragStartRef.current.y })
  }

  const handleMouseUp = () => setIsDragging(false)

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const newZoom = Math.min(Math.max(zoom * (e.deltaY > 0 ? 0.9 : 1.1), 0.5), 10)
    const rect    = e.currentTarget.getBoundingClientRect()
    applyZoom(newZoom, e.clientX - rect.left, e.clientY - rect.top)
  }

  const zoomAtCenter = (delta: number) => {
    const container = containerRef.current
    if (!container) return
    const newZoom = Math.min(Math.max(zoom * delta, 0.5), 10)
    applyZoom(newZoom, container.clientWidth / 2, container.clientHeight / 2)
  }

  return (
    <div
      className={className}
      style={{ position: 'relative', overflow: 'hidden', background: '#1a1a1a' }}
    >
      {/* ズームボタン */}
      <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button
          onClick={() => zoomAtCenter(1.25)}
          style={{ width: 28, height: 28, background: 'rgba(0,0,0,0.6)', color: '#fff', border: '1px solid #555', borderRadius: 4, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
        >+</button>
        <button
          onClick={() => zoomAtCenter(0.8)}
          style={{ width: 28, height: 28, background: 'rgba(0,0,0,0.6)', color: '#fff', border: '1px solid #555', borderRadius: 4, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
        >−</button>
      </div>

      <div
        ref={containerRef}
        style={{ overflow: 'hidden', width: '100%', height: '100%', cursor: isDragging ? 'grabbing' : 'grab' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <canvas
          ref={canvasRef}
          style={{
            display: 'block',
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            transformOrigin: 'top left',
          }}
        />
      </div>
    </div>
  )
}
