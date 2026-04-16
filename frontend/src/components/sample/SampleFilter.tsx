import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Scene } from '@/types/scene'

interface SampleFilterProps {
  scenes:             Scene[]
  selectedSceneToken: string | null
  onFilterChange:     (token: string) => void
  locked:             boolean
}

export default function SampleFilter({
  scenes,
  selectedSceneToken,
  onFilterChange,
  locked,
}: SampleFilterProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <p className="text-gray-300 text-xs font-medium">Scene</p>
        {locked && <span className="text-yellow-400 text-xs">🔒</span>}
      </div>
      <Select
        value={selectedSceneToken ?? ''}
        onValueChange={onFilterChange}
        disabled={locked}
      >
        <SelectTrigger
          className="h-8 text-xs border-gray-500 text-white"
          style={{ backgroundColor: locked ? '#4a4a4a' : '#374151' }}
        >
          <SelectValue placeholder="シーンを選択" />
        </SelectTrigger>
        <SelectContent>
          {scenes.map((scene) => (
            <SelectItem key={scene.token} value={scene.token} className="text-xs">
              {scene.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
