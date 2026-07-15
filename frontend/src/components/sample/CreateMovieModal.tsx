import { useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { useMovieBuilder } from '@/hooks/useMovieBuilder'
import { MOVIE_CHANNEL_ORDER } from '@/lib/movieFrame'
import type { CalibratedSensor, EgoPosePoint } from '@/types/sensor'
import type { Sample } from '@/types/scene'

interface CreateMovieModalProps {
  open:           boolean
  onOpenChange:   (open: boolean) => void
  sceneToken:     string
  sceneName:      string | null
  samples:        Sample[]      // timestamp 昇順
  calibSensorMap: Record<string, CalibratedSensor>
  egoPoses:       EgoPosePoint[]
  location:       string | null
}

const FPS_OPTIONS = [
  { value: '2',  label: '2 Hz（実時間相当）' },
  { value: '5',  label: '5 Hz' },
  { value: '10', label: '10 Hz' },
]

export default function CreateMovieModal({
  open,
  onOpenChange,
  sceneToken,
  sceneName,
  samples,
  calibSensorMap,
  egoPoses,
  location,
}: CreateMovieModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { state, start, cancel, reset } = useMovieBuilder(canvasRef)

  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(
    () => new Set(MOVIE_CHANNEL_ORDER),
  )
  const [fps, setFps] = useState('2')

  const isRunning = state.phase === 'prefetch' || state.phase === 'recording'

  const toggleChannel = (channel: string, checked: boolean) => {
    setSelectedChannels((prev) => {
      const next = new Set(prev)
      if (checked) next.add(channel)
      else next.delete(channel)
      return next
    })
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      // 実行中クローズは録画破棄、完了後クローズはリソース解放
      if (isRunning) cancel()
      reset()
    }
    onOpenChange(nextOpen)
  }

  const handleStart = () => {
    start({
      sceneToken,
      samples,
      channels: [...selectedChannels],
      fps: Number(fps),
      calibSensorMap,
      egoPoses,
      location,
    })
  }

  const handleDownload = () => {
    if (!state.videoUrl) return
    const a = document.createElement('a')
    a.href     = state.videoUrl
    a.download = `movie_${sceneName ?? sceneToken}_${fps}hz.webm`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const progressPercent = state.total > 0
    ? Math.round((state.completed / state.total) * 100)
    : 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Movie</DialogTitle>
          <DialogDescription>
            シーン{sceneName ? `「${sceneName}」` : ''}の全 {samples.length} サンプルを動画化します
          </DialogDescription>
        </DialogHeader>

        {/* ── センサー選択 ── */}
        <div>
          <div className="text-sm font-medium mb-2">Sensors</div>
          <div className="grid grid-cols-3 gap-2">
            {MOVIE_CHANNEL_ORDER.map((channel) => (
              <label
                key={channel}
                className="flex items-center gap-2 text-xs cursor-pointer select-none"
              >
                <Checkbox
                  checked={selectedChannels.has(channel)}
                  onCheckedChange={(checked) => toggleChannel(channel, checked === true)}
                  disabled={isRunning}
                />
                {channel}
              </label>
            ))}
          </div>
        </div>

        {/* ── フレームレート選択 ── */}
        <div className="flex items-center gap-3">
          <div className="text-sm font-medium">Frame rate</div>
          <Select value={fps} onValueChange={setFps} disabled={isRunning}>
            <SelectTrigger className="w-48 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FPS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* ── 進捗 ── */}
        {isRunning && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-600">
              <span>
                {state.phase === 'prefetch'
                  ? `Prefetching data… ${state.completed}/${state.total}`
                  : `Recording… ${state.completed}/${state.total}`}
              </span>
              <span>{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} />
            {state.phase === 'recording' && (
              <div className="text-xs text-amber-600">
                録画中はこのタブを前面に保ってください（バックグラウンドでは録画が遅延します）
              </div>
            )}
          </div>
        )}

        {/* ── エラー ── */}
        {state.phase === 'error' && (
          <div className="text-sm text-red-600">{state.error}</div>
        )}

        {/* ── 録画用 Canvas（ライブプレビュー）──
            captureStream の対象なので display:none にせず高さ 0 で折りたたむ */}
        <div
          style={
            state.phase === 'recording'
              ? { width: '100%' }
              : { height: 0, overflow: 'hidden' }
          }
        >
          <canvas
            ref={canvasRef}
            style={{ maxWidth: '100%', height: 'auto', display: 'block', background: '#111' }}
          />
        </div>

        {/* ── 完成動画 ── */}
        {state.phase === 'done' && state.videoUrl && (
          <video
            src={state.videoUrl}
            controls
            autoPlay
            loop
            className="w-full bg-black"
          />
        )}

        {/* ── アクション ── */}
        <div className="flex justify-end gap-2">
          {isRunning && (
            <Button variant="outline" className="text-xs" onClick={() => { cancel(); reset() }}>
              Cancel
            </Button>
          )}
          {state.phase === 'done' ? (
            <>
              <Button variant="outline" className="text-xs" onClick={reset}>
                Create another
              </Button>
              <Button
                className="text-white text-xs"
                style={{ backgroundColor: '#4A90D9' }}
                onClick={handleDownload}
              >
                Download
              </Button>
            </>
          ) : (
            <Button
              className="text-white text-xs"
              style={{ backgroundColor: '#4A90D9' }}
              disabled={isRunning || selectedChannels.size === 0 || samples.length === 0}
              onClick={handleStart}
            >
              Create Movie
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
