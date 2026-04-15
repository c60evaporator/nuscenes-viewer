import { useEffect, useRef, useState } from 'react'
import { basemapUrl } from '@/api/maps'
import { drawEgoPoses } from '@/lib/canvasUtils'
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
  const imgRef    = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [zoom, setZoom] = useState(1)

  const draw = () => {
    const img    = imgRef.current
    const canvas = canvasRef.current
    if (!img || !canvas || !img.naturalWidth) return

    canvas.width  = img.naturalWidth
    canvas.height = img.naturalHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    drawEgoPoses(
      ctx,
      egoPoses,
      currentIndex,
      { width: canvas.width, height: canvas.height },
      showStartEnd,
    )
  }

  // ego pose / currentIndex が変わるたびに再描画
  useEffect(() => { draw() }, [egoPoses, currentIndex, showStartEnd])

  // cropToContent のズーム倍率を計算
  useEffect(() => {
    if (!cropToContent || egoPoses.length === 0) {
      setZoom(1)
      return
    }
    const img = imgRef.current
    if (!img || !img.naturalWidth) return

    const xs = egoPoses.map((p) => p.translation[0])
    const ys = egoPoses.map((p) => p.translation[1])
    const rangeX = Math.max(...xs) - Math.min(...xs) || 1
    const rangeY = Math.max(...ys) - Math.min(...ys) || 1

    // 簡易推定: pose 範囲がマップ全体に占める割合でズーム
    const padding = 40
    const scaleX = (img.naturalWidth  - padding * 2) / rangeX
    const scaleY = (img.naturalHeight - padding * 2) / rangeY
    const scale  = Math.min(scaleX, scaleY)

    // マップ画像 1px = 1m と仮定したズーム比
    const estZoom = Math.min(scale, 5)
    setZoom(estZoom > 1 ? estZoom : 1)
  }, [cropToContent, egoPoses])

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

      {/* マップ画像 + Canvas オーバーレイ */}
      <div style={{ transform: `scale(${zoom})`, transformOrigin: 'center center', transition: 'transform 0.1s' }}>
        <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
          <img
            ref={imgRef}
            src={basemapUrl(location)}
            alt={`Map: ${location}`}
            style={{ width: '100%', display: 'block' }}
            onLoad={draw}
          />
          <canvas
            ref={canvasRef}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
          />
        </div>
      </div>
    </div>
  )
}
