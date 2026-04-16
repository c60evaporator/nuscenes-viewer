import type { Instance } from '@/types/annotation'

interface InstanceListProps {
  instances:            Instance[]
  currentInstanceToken: string | null
  onSelect:             (token: string) => void
}

export default function InstanceList({ instances, currentInstanceToken, onSelect }: InstanceListProps) {
  if (instances.length === 0) {
    return <p className="p-3 text-gray-400 text-xs">インスタンスがありません</p>
  }

  return (
    <ul className="divide-y divide-gray-100">
      {instances.map((inst) => {
        const isSelected = inst.token === currentInstanceToken
        return (
          <li
            key={inst.token}
            onClick={() => onSelect(inst.token)}
            className="px-3 py-2 cursor-pointer hover:bg-blue-50 transition-colors"
            style={isSelected ? {
              backgroundColor: 'rgba(74,144,217,0.12)',
              borderLeft: '3px solid #4A90D9',
              paddingLeft: '9px',
            } : { borderLeft: '3px solid transparent' }}
          >
            <p className="text-xs font-medium text-gray-800">{inst.category_name}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {inst.nbr_annotations} annotations
            </p>
            <p className="text-xs text-gray-300 mt-0.5 truncate">{inst.token}</p>
          </li>
        )
      })}
    </ul>
  )
}
