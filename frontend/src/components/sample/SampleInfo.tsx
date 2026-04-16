import { useNavigationStore } from '@/store/navigationStore'
import { useViewerStore } from '@/store/viewerStore'
import type { Sample } from '@/types/scene'
import type { InstanceSummary } from '@/types/sensor'
import type { TabId } from '@/components/layout/Header'

interface SampleInfoProps {
  sample:      Sample | null
  instances:   InstanceSummary[]
  sceneToken:  string | null
  onTabChange: (tab: TabId) => void
}

function InfoRow({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex flex-col gap-0.5 py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-xs text-gray-700 break-all">{value ?? '—'}</span>
    </div>
  )
}

function formatTimestamp(ts: number): string {
  return new Date(ts / 1000).toLocaleString('ja-JP')
}

export default function SampleInfo({ sample, instances, sceneToken, onTabChange }: SampleInfoProps) {
  const lock        = useNavigationStore((s) => s.lock)
  const setInstance = useViewerStore((s) => s.setInstance)

  const handleInstanceDoubleClick = (inst: InstanceSummary) => {
    lock('sample', { sceneToken: sceneToken ?? undefined, categoryName: inst.category_name })
    setInstance(inst.instance_token)
    onTabChange('instance')
  }

  return (
    <div className="flex flex-col h-full">
      {/* サンプル情報 */}
      <div className="flex-shrink-0 pb-2">
        {sample ? (
          <>
            <InfoRow label="Token"       value={sample.token} />
            <InfoRow label="Timestamp"   value={formatTimestamp(sample.timestamp)} />
            <InfoRow label="Scene Token" value={sample.scene_token} />
            <InfoRow label="Prev"        value={sample.prev} />
            <InfoRow label="Next"        value={sample.next} />
          </>
        ) : (
          <p className="text-gray-400 text-xs">サンプルを選択してください</p>
        )}
      </div>

      {/* インスタンスリスト */}
      {instances.length > 0 && (
        <div className="flex-1 min-h-0 overflow-y-auto border-t border-gray-100 pt-2">
          <p className="text-xs font-semibold text-gray-500 mb-1 px-1">
            Instances ({instances.length})
          </p>
          <ul className="divide-y divide-gray-100">
            {instances.map((inst) => (
              <li
                key={inst.instance_token}
                className="px-1 py-1.5 cursor-pointer hover:bg-blue-50 rounded text-xs select-none"
                onDoubleClick={() => handleInstanceDoubleClick(inst)}
                title="ダブルクリックで Instance 画面へ"
              >
                <span className="font-medium text-gray-700">{inst.category_name}</span>
                <span className="text-gray-400 ml-1">×{inst.nbr_annotations}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
