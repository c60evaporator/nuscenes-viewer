import { useEffect, useRef } from 'react'
import type { Scene } from '@/types/scene'

interface SceneListProps {
  scenes:            Scene[]
  currentSceneToken: string | null
  onSelect:          (token: string) => void
  scrollToToken?:    string | null   // 指定 token の項目を可視域までスクロール（Import 後の新 scene 用）
}

export default function SceneList({ scenes, currentSceneToken, onSelect, scrollToToken }: SceneListProps) {
  const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map())

  useEffect(() => {
    if (!scrollToToken) return
    const el = itemRefs.current.get(scrollToToken)
    if (el) el.scrollIntoView({ block: 'center' })
  }, [scrollToToken, scenes])

  if (scenes.length === 0) {
    return (
      <p className="p-3 text-gray-400 text-xs">シーンがありません</p>
    )
  }

  return (
    <ul className="divide-y divide-gray-100">
      {scenes.map((scene) => {
        const isSelected    = scene.token === currentSceneToken
        const isUserCreated = scene.is_user_created

        // 左アクセントバー: ユーザ追加は緑を最優先で残す / 次に選択青 / それ以外は透明
        const accentColor = isUserCreated ? '#16a34a' : (isSelected ? '#4A90D9' : 'transparent')
        // 背景: 選択青を優先 → ユーザ追加の淡緑 → なし
        const bg = isSelected ? 'rgba(74,144,217,0.12)' : (isUserCreated ? '#f0fdf4' : undefined)
        const hasAccent = isSelected || isUserCreated

        return (
          <li
            key={scene.token}
            ref={(el) => {
              if (el) itemRefs.current.set(scene.token, el)
              else    itemRefs.current.delete(scene.token)
            }}
            onClick={() => onSelect(scene.token)}
            className="px-3 py-2 cursor-pointer hover:bg-blue-50 transition-colors"
            style={{
              borderLeft: `3px solid ${accentColor}`,
              ...(hasAccent ? { paddingLeft: '9px' } : {}),
              ...(bg ? { backgroundColor: bg } : {}),
            }}
          >
            <p className="text-sm font-medium text-gray-800 truncate">{scene.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">{scene.nbr_samples} samples</p>
          </li>
        )
      })}
    </ul>
  )
}
