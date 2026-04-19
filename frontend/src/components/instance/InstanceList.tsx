import { useEffect, useRef } from 'react'
import type { Instance } from '@/types/annotation'

interface InstanceListProps {
  instances:               Instance[]
  currentInstanceToken:    string | null
  onSelect:                (token: string) => void
  highlightInstanceToken?: string | null
}

export default function InstanceList({
  instances, currentInstanceToken, onSelect, highlightInstanceToken,
}: InstanceListProps) {
  const highlightRef = useRef<HTMLLIElement | null>(null)

  useEffect(() => {
    highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [highlightInstanceToken])

  if (instances.length === 0) {
    return <p className="p-3 text-gray-400 text-xs">インスタンスがありません</p>
  }

  return (
    <ul className="divide-y divide-gray-100">
      {instances.map((inst) => {
        const isSelected    = inst.token === currentInstanceToken
        const isHighlighted = inst.token === highlightInstanceToken
        return (
          <li
            key={inst.token}
            ref={isHighlighted ? highlightRef : null}
            onClick={() => onSelect(inst.token)}
            className="px-3 py-2 cursor-pointer hover:bg-blue-50 transition-colors"
            style={{
              ...(isSelected ? {
                backgroundColor: 'rgba(74,144,217,0.12)',
                borderLeft: '3px solid #4A90D9',
                paddingLeft: '9px',
              } : { borderLeft: '3px solid transparent' }),
              ...(isHighlighted ? {
                backgroundColor: 'rgba(250,204,21,0.15)',
                borderLeft: '3px solid #FACC15',
                paddingLeft: '9px',
              } : {}),
            }}
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
