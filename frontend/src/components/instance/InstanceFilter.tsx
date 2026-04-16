import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Scene } from '@/types/scene'
import type { Category } from '@/types/annotation'

interface InstanceFilterProps {
  scenes:               Scene[]
  selectedSceneToken:   string | null
  onSceneChange:        (token: string) => void
  sceneTokenLocked:     boolean
  categories:           Category[]
  selectedCategoryName: string | null
  onCategoryChange:     (name: string | null) => void
}

export default function InstanceFilter({
  scenes,
  selectedSceneToken,
  onSceneChange,
  sceneTokenLocked,
  categories,
  selectedCategoryName,
  onCategoryChange,
}: InstanceFilterProps) {
  return (
    <div className="space-y-2">
      {/* Scene フィルタ */}
      <div>
        <div className="flex items-center gap-1 mb-1">
          <p className="text-gray-300 text-xs font-medium">Scene</p>
          {sceneTokenLocked && <span className="text-yellow-400 text-xs">🔒</span>}
        </div>
        <Select
          value={selectedSceneToken ?? ''}
          onValueChange={onSceneChange}
          disabled={sceneTokenLocked}
        >
          <SelectTrigger
            className="h-8 text-xs border-gray-500 text-white"
            style={{ backgroundColor: sceneTokenLocked ? '#4a4a4a' : '#374151' }}
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

      {/* Category フィルタ */}
      <div>
        <p className="text-gray-300 text-xs font-medium mb-1">Category</p>
        <Select
          value={selectedCategoryName ?? '__all__'}
          onValueChange={(v) => onCategoryChange(v === '__all__' ? null : v)}
        >
          <SelectTrigger className="h-8 text-xs border-gray-500 text-white" style={{ backgroundColor: '#374151' }}>
            <SelectValue placeholder="すべて" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__" className="text-xs">すべて</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.token} value={cat.name} className="text-xs">
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
