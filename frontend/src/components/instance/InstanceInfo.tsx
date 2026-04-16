import { Button } from '@/components/ui/button'
import type { Instance } from '@/types/annotation'

interface InstanceInfoProps {
  instance:            Instance | null
  onAnnotationsClick:  () => void
}

function InfoRow({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex flex-col gap-0.5 py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-xs text-gray-700 break-all">{value ?? '—'}</span>
    </div>
  )
}

export default function InstanceInfo({ instance, onAnnotationsClick }: InstanceInfoProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 overflow-y-auto">
        {instance ? (
          <>
            <InfoRow label="Token"           value={instance.token} />
            <InfoRow label="Category Token"  value={instance.category_token} />
            <InfoRow label="Category"        value={instance.category_name} />
            <InfoRow label="# Annotations"   value={instance.nbr_annotations} />
            <InfoRow label="First Ann Token" value={instance.first_annotation_token} />
            <InfoRow label="Last Ann Token"  value={instance.last_annotation_token} />
          </>
        ) : (
          <p className="text-gray-400 text-xs">インスタンスを選択してください</p>
        )}
      </div>

      <div className="flex-shrink-0 pt-3 border-t border-gray-200">
        <Button
          className="w-full text-white text-xs"
          style={{ backgroundColor: '#4A90D9' }}
          disabled={!instance}
          onClick={onAnnotationsClick}
        >
          Annotations
        </Button>
      </div>
    </div>
  )
}
