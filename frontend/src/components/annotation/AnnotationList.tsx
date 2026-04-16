import type { Annotation } from '@/types/annotation'

interface AnnotationListProps {
  annotations:           Annotation[]
  currentAnnotationToken: string | null
  onSelect:              (token: string) => void
  categoryMap:           Record<string, string>  // category_token → category_name
}

export default function AnnotationList({
  annotations,
  currentAnnotationToken,
  onSelect,
  categoryMap,
}: AnnotationListProps) {
  if (annotations.length === 0) {
    return <p className="p-3 text-gray-400 text-xs">アノテーションがありません</p>
  }

  return (
    <ul className="divide-y divide-gray-100">
      {annotations.map((ann) => {
        const isSelected = ann.token === currentAnnotationToken
        const categoryName = categoryMap[ann.category_token] ?? ann.category_token
        return (
          <li
            key={ann.token}
            onClick={() => onSelect(ann.token)}
            className="px-3 py-2 cursor-pointer hover:bg-blue-50 transition-colors"
            style={isSelected ? {
              backgroundColor: 'rgba(74,144,217,0.12)',
              borderLeft: '3px solid #4A90D9',
              paddingLeft: '9px',
            } : { borderLeft: '3px solid transparent' }}
          >
            <p className="text-xs font-medium text-gray-800">{categoryName}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              lidar: {ann.num_lidar_pts} pts
            </p>
            <p className="text-xs text-gray-300 mt-0.5 truncate">{ann.token}</p>
          </li>
        )
      })}
    </ul>
  )
}
