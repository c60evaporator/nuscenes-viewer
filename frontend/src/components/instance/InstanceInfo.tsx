import type { Instance } from '@/types/annotation'

interface InstanceInfoProps {
  instance: Instance | null
}

function InfoRow({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex flex-col gap-0.5 py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-xs text-gray-700 break-all">{value ?? '—'}</span>
    </div>
  )
}

export default function InstanceInfo({ instance }: InstanceInfoProps) {
  if (!instance) {
    return <p className="text-gray-400 text-xs">インスタンスを選択してください</p>
  }

  return (
    <div>
      <InfoRow label="Token"           value={instance.token} />
      <InfoRow label="Category Token"  value={instance.category_token} />
      <InfoRow label="Category"        value={instance.category_name} />
      <InfoRow label="# Annotations"   value={instance.nbr_annotations} />
      <InfoRow label="First Ann Token" value={instance.first_annotation_token} />
      <InfoRow label="Last Ann Token"  value={instance.last_annotation_token} />
    </div>
  )
}
