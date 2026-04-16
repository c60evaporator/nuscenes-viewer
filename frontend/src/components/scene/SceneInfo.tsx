import type { Scene } from '@/types/scene'

interface SceneInfoProps {
  scene: Scene | null
}

function InfoRow({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex flex-col gap-0.5 py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-xs text-gray-700 break-all">{value ?? '—'}</span>
    </div>
  )
}

export default function SceneInfo({ scene }: SceneInfoProps) {
  if (!scene) {
    return (
      <p className="text-gray-400 text-xs">シーンを選択してください</p>
    )
  }

  return (
    <div>
      <InfoRow label="Token"        value={scene.token} />
      <InfoRow label="Name"         value={scene.name} />
      <InfoRow label="Description"  value={scene.description} />
      <InfoRow label="Samples"      value={scene.nbr_samples} />
      <InfoRow label="Log Token"    value={scene.log_token} />
      <InfoRow label="First Sample" value={scene.first_sample_token} />
      <InfoRow label="Last Sample"  value={scene.last_sample_token} />
    </div>
  )
}
