import type { Sample } from '@/types/scene'

interface SampleSliderProps {
  samples:       Sample[]   // timestamp 昇順
  selectedIndex: number
  onIndexChange: (index: number) => void
}

function formatTimestamp(ts: number): string {
  return new Date(ts / 1000).toLocaleTimeString('ja-JP', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export default function SampleSlider({ samples, selectedIndex, onIndexChange }: SampleSliderProps) {
  if (samples.length === 0) {
    return (
      <div className="px-3 py-2">
        <p className="text-gray-300 text-xs font-medium mb-1">Sample</p>
        <p className="text-gray-400 text-xs">サンプルなし</p>
      </div>
    )
  }

  const current = samples[selectedIndex]

  return (
    <div className="px-3 py-2">
      <p className="text-gray-300 text-xs font-medium mb-1">
        Sample ({selectedIndex + 1} / {samples.length})
      </p>
      {current && (
        <p className="text-gray-400 text-xs mb-2">
          {formatTimestamp(current.timestamp)}
        </p>
      )}
      <input
        type="range"
        min={0}
        max={samples.length - 1}
        value={selectedIndex}
        onChange={(e) => onIndexChange(Number(e.target.value))}
        className="w-full accent-blue-500"
        style={{ cursor: 'pointer' }}
      />
      <div className="flex justify-between mt-1">
        <span className="text-gray-400 text-xs">Start</span>
        <span className="text-gray-400 text-xs">End</span>
      </div>
    </div>
  )
}
