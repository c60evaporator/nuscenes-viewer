import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { SensorDataMap } from '@/types/sensor'

interface SensorSelectorProps {
  sampleDataMap:   SensorDataMap
  selectedChannel: string
  onChannelChange: (channel: string) => void
}

// 表示するチャンネルの優先順
const CHANNEL_ORDER = [
  'CAM_FRONT', 'CAM_FRONT_LEFT', 'CAM_FRONT_RIGHT',
  'CAM_BACK', 'CAM_BACK_LEFT', 'CAM_BACK_RIGHT',
  'LIDAR_TOP', 'FUSED_RADER',
]

export default function SensorSelector({
  sampleDataMap,
  selectedChannel,
  onChannelChange,
}: SensorSelectorProps) {
  const availableChannels = CHANNEL_ORDER.filter((ch) => ch in sampleDataMap)

  return (
    <div>
      <p className="text-gray-300 text-xs font-medium mb-1">Sensor</p>
      <Select value={selectedChannel} onValueChange={onChannelChange}>
        <SelectTrigger className="h-8 text-xs border-gray-500 text-white" style={{ backgroundColor: '#374151' }}>
          <SelectValue placeholder="センサーを選択" />
        </SelectTrigger>
        <SelectContent>
          {availableChannels.map((ch) => (
            <SelectItem key={ch} value={ch} className="text-xs">{ch}</SelectItem>
          ))}
          {availableChannels.length === 0 && (
            <SelectItem value="__none__" disabled className="text-xs">サンプルを選択してください</SelectItem>
          )}
        </SelectContent>
      </Select>
    </div>
  )
}
