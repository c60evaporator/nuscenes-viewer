import type { Annotation } from '@/types/annotation'

interface AnnotationInfoProps {
  annotation:  Annotation | null
  categoryMap: Record<string, string>  // category_token → category_name
}

function InfoRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5 py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-xs text-gray-700 break-all">{value ?? '—'}</span>
    </div>
  )
}

function formatVec(v: number[] | null | undefined): string {
  if (!v) return '—'
  return '[' + v.map((n) => n.toFixed(3)).join(', ') + ']'
}

export default function AnnotationInfo({ annotation, categoryMap }: AnnotationInfoProps) {
  if (!annotation) {
    return <p className="text-gray-400 text-xs">アノテーションを選択してください</p>
  }

  const categoryName = categoryMap[annotation.category_token] ?? annotation.category_token
  const attrNames    = annotation.attributes.map((a) => a.name).join(', ')

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <InfoRow label="Token"          value={annotation.token} />
      <InfoRow label="Category"       value={categoryName} />
      <InfoRow label="Sample Token"   value={annotation.sample_token} />
      <InfoRow label="Instance Token" value={annotation.instance_token} />
      <InfoRow label="Translation"    value={formatVec(annotation.translation)} />
      <InfoRow label="Rotation"       value={formatVec(annotation.rotation)} />
      <InfoRow label="Size"           value={formatVec(annotation.size)} />
      <InfoRow label="Lidar Pts"      value={annotation.num_lidar_pts} />
      <InfoRow label="Radar Pts"      value={annotation.num_radar_pts} />
      <InfoRow label="Visibility"     value={annotation.visibility?.level ?? null} />
      <InfoRow label="Attributes"     value={attrNames || '—'} />
      <InfoRow label="Prev"           value={annotation.prev} />
      <InfoRow label="Next"           value={annotation.next} />
    </div>
  )
}
