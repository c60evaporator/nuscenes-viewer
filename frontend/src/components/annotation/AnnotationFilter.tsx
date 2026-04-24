import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Scene, Sample } from '@/types/scene'
import type { InstanceSummary } from '@/types/sensor'

interface AnnotationFilterProps {
  // Scene フィルタ
  scenes:             Scene[]
  selectedSceneToken: string | null
  onSceneChange:      (token: string) => void
  sceneTokenLocked:   boolean

  // Sample フィルタ
  samples:              Sample[]
  selectedSampleToken:  string | null
  onSampleChange:       (token: string | null) => void
  sampleTokenLocked:    boolean

  // Instance フィルタ
  instanceSummaries:    InstanceSummary[]
  selectedInstanceToken: string | null
  onInstanceChange:     (token: string | null) => void
  instanceTokenLocked:  boolean
}

const ALL = '__all__'

export default function AnnotationFilter({
  scenes,
  selectedSceneToken,
  onSceneChange,
  sceneTokenLocked,
  samples,
  selectedSampleToken,
  onSampleChange,
  sampleTokenLocked,
  instanceSummaries,
  selectedInstanceToken,
  onInstanceChange,
  instanceTokenLocked,
}: AnnotationFilterProps) {
  return (
    <div className="space-y-2">
      {/* Scene */}
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
            {scenes.map((s) => (
              <SelectItem key={s.token} value={s.token} className="text-xs">{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Sample */}
      <div>
        <div className="flex items-center gap-1 mb-1">
          <p className="text-gray-300 text-xs font-medium">Sample</p>
          {sampleTokenLocked && <span className="text-yellow-400 text-xs">🔒</span>}
        </div>
        <Select
          value={selectedSampleToken ?? ALL}
          onValueChange={(v) => onSampleChange(v === ALL ? null : v)}
          disabled={sampleTokenLocked}
        >
          <SelectTrigger
            className="h-8 text-xs border-gray-500 text-white"
            style={{ backgroundColor: sampleTokenLocked ? '#4a4a4a' : '#374151' }}
          >
            <SelectValue placeholder="すべて" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL} className="text-xs">すべて</SelectItem>
            {samples.map((s, i) => (
              <SelectItem key={s.token} value={s.token} className="text-xs">
                #{i + 1} — {new Date(s.timestamp / 1000).toLocaleTimeString('ja-JP')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Instance */}
      <div>
        <div className="flex items-center gap-1 mb-1">
          <p className="text-gray-300 text-xs font-medium">Instance</p>
          {instanceTokenLocked && <span className="text-yellow-400 text-xs">🔒</span>}
        </div>
        {instanceTokenLocked && selectedInstanceToken ? (
          // ロック時: サンプル未選択で instanceSummaries が空のためテキスト表示
          <div
            className="h-8 flex items-center px-2 text-xs text-gray-300 rounded border border-gray-500 overflow-hidden"
            style={{ backgroundColor: '#4a4a4a' }}
            title={selectedInstanceToken}
          >
            <span className="truncate">{selectedInstanceToken}</span>
          </div>
        ) : (
          <Select
            value={selectedInstanceToken ?? ALL}
            onValueChange={(v) => onInstanceChange(v === ALL ? null : v)}
            disabled={instanceTokenLocked}
          >
            <SelectTrigger
              className="h-8 text-xs border-gray-500 text-white"
              style={{ backgroundColor: '#374151' }}
            >
              <SelectValue placeholder="すべて" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL} className="text-xs">すべて</SelectItem>
              {instanceSummaries.map((inst) => (
                <SelectItem key={inst.instance_token} value={inst.instance_token} className="text-xs">
                  {inst.category_name} ({inst.nbr_annotations})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  )
}
