import type { Sample } from '@/types/scene'

interface SampleListProps {
  samples:            Sample[]
  currentSampleToken: string | null
  onSelect:           (token: string) => void
}

function formatTimestamp(ts: number): string {
  // UNIX timestamp in microseconds → ms
  return new Date(ts / 1000).toLocaleTimeString('ja-JP', {
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export default function SampleList({ samples, currentSampleToken, onSelect }: SampleListProps) {
  if (samples.length === 0) {
    return <p className="p-3 text-gray-400 text-xs">サンプルがありません</p>
  }

  return (
    <ul className="divide-y divide-gray-100">
      {samples.map((sample, index) => {
        const isSelected = sample.token === currentSampleToken
        return (
          <li
            key={sample.token}
            onClick={() => onSelect(sample.token)}
            className="px-3 py-2 cursor-pointer hover:bg-blue-50 transition-colors"
            style={isSelected ? {
              backgroundColor: 'rgba(74,144,217,0.12)',
              borderLeft: '3px solid #4A90D9',
              paddingLeft: '9px',
            } : { borderLeft: '3px solid transparent' }}
          >
            <p className="text-xs font-medium text-gray-800">#{index + 1}</p>
            <p className="text-xs text-gray-400 mt-0.5">{formatTimestamp(sample.timestamp)}</p>
          </li>
        )
      })}
    </ul>
  )
}
