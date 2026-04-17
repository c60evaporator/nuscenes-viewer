import { useEffect, useRef, useState } from 'react'
import { useBasemap } from '@/api/maps'
import { drawEgoPoses } from '@/lib/canvasUtils'
import { egoPoseToPixel, NUSCENES_MAP_META } from '@/lib/coordinateUtils'
import type { EgoPosePoint } from '@/types/sensor'

interface MapCanvasProps {
  location:       string
  egoPoses:       EgoPosePoint[]
  currentIndex?:  number    // 強調する点のインデックス（デフォルト -1）
  cropToContent?: boolean   // ego pose 範囲に自動ズーム（デフォルト false）
  showStartEnd?:  boolean   // Start/End ラベル（デフォルト true）
  className?:     string
}

export default function MapCanvas({
  location,
  egoPoses,
  currentIndex  = -1,
  cropToContent = false,
  showStartEnd  = true,
  className,
}: MapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [zoom, setZoom] = useState(1)
  const { data: bitmap } = useBasemap(location)

  // basemap + ego poses を単一 canvas に描画
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !bitmap) return

    const displaySize: [number, number] = [bitmap.width, bitmap.height]

    if (egoPoses.length > 0) {
      const meta = NUSCENES_MAP_META[location]
      console.log('[MapCanvas] location:', location)
      console.log('[MapCanvas] canvasEdge:', meta?.canvasEdge)
      console.log('[MapCanvas] displaySize:', displaySize)
      console.log('[MapCanvas] first translation:', egoPoses[0].translation)
      console.log('[MapCanvas] first pixel:', egoPoseToPixel(egoPoses[0].translation, location, displaySize))
    }

    canvas.width  = bitmap.width
    canvas.height = bitmap.height

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(bitmap, 0, 0)
    drawEgoPoses(ctx, egoPoses, currentIndex, displaySize, location, showStartEnd)
  }, [bitmap, egoPoses, currentIndex, showStartEnd, location])

  // cropToContent のズーム倍率を計算
  useEffect(() => {
    if (!cropToContent || egoPoses.length === 0 || !bitmap) {
      setZoom(1)
      return
    }

    const displaySize: [number, number] = [bitmap.width, bitmap.height]
    const pixels = egoPoses.map((p) => egoPoseToPixel(p.translation, location, displaySize))
    const pxs    = pixels.map(([px]) => px)
    const pys    = pixels.map(([, py]) => py)
    const rangeX = (Math.max(...pxs) - Math.min(...pxs)) || 1
    const rangeY = (Math.max(...pys) - Math.min(...pys)) || 1

    const padding = 40
    const scaleX  = (bitmap.width  - padding * 2) / rangeX
    const scaleY  = (bitmap.height - padding * 2) / rangeY

    setZoom(Math.min(Math.min(scaleX, scaleY), 5))
  }, [cropToContent, egoPoses, bitmap, location])

  return (
    <div
      className={className}
      style={{ position: 'relative', overflow: 'hidden', background: '#1a1a1a' }}
    >
      {/* ズームボタン */}
      <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button
          onClick={() => setZoom((z) => Math.min(z * 1.25, 20))}
          style={{ width: 28, height: 28, background: 'rgba(0,0,0,0.6)', color: '#fff', border: '1px solid #555', borderRadius: 4, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
        >+</button>
        <button
          onClick={() => setZoom((z) => Math.max(z / 1.25, 0.5))}
          style={{ width: 28, height: 28, background: 'rgba(0,0,0,0.6)', color: '#fff', border: '1px solid #555', borderRadius: 4, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
        >−</button>
      </div>

      <div style={{ transform: `scale(${zoom})`, transformOrigin: 'center center', transition: 'transform 0.1s' }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', display: 'block' }}
        />
      </div>
    </div>
  )
}
