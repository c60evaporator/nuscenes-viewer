import type { Scene } from '@/types/scene'

interface SceneListProps {
  scenes:            Scene[]
  currentSceneToken: string | null
  onSelect:          (token: string) => void
}

export default function SceneList({ scenes, currentSceneToken, onSelect }: SceneListProps) {
  if (scenes.length === 0) {
    return (
      <p className="p-3 text-gray-400 text-xs">シーンがありません</p>
    )
  }

  return (
    <ul className="divide-y divide-gray-100">
      {scenes.map((scene) => {
        const isSelected = scene.token === currentSceneToken
        return (
          <li
            key={scene.token}
            onClick={() => onSelect(scene.token)}
            className="px-3 py-2 cursor-pointer hover:bg-blue-50 transition-colors"
            style={isSelected ? {
              backgroundColor: 'rgba(74,144,217,0.12)',
              borderLeft: '3px solid #4A90D9',
              paddingLeft: '9px',
            } : { borderLeft: '3px solid transparent' }}
          >
            <p className="text-sm font-medium text-gray-800 truncate">{scene.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">{scene.nbr_samples} samples</p>
          </li>
        )
      })}
    </ul>
  )
}
