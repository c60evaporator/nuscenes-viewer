import { useCallback, useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useLogs } from '@/api/logs'
import { useViewerStore } from '@/store/viewerStore'
import { useNavigationStore } from '@/store/navigationStore'

import SceneIcon      from '@/assets/icons/scene.svg?react'
import SampleIcon     from '@/assets/icons/sample.svg?react'
import InstanceIcon   from '@/assets/icons/instance.svg?react'
import AnnotationIcon from '@/assets/icons/annotation.svg?react'
import MapIcon        from '@/assets/icons/map.svg?react'
import SampleMapIcon  from '@/assets/icons/sample_map.svg?react'

export type TabId = 'scene' | 'sample' | 'instance' | 'annotation' | 'map' | 'sample-map'

const ACTIVE_COLOR   = '#4A90D9'
const INACTIVE_COLOR = '#ffffff'

export const TABS: {
  id:    TabId
  label: string
  Icon:  React.FC<React.SVGProps<SVGSVGElement>>
}[] = [
  { id: 'scene',      label: 'Scene',      Icon: SceneIcon },
  { id: 'sample',     label: 'Sample',     Icon: SampleIcon },
  { id: 'instance',   label: 'Instance',   Icon: InstanceIcon },
  { id: 'annotation', label: 'Annotation', Icon: AnnotationIcon },
  { id: 'map',        label: 'Map',        Icon: MapIcon },
  { id: 'sample-map', label: 'Sample&Map', Icon: SampleMapIcon },
]

interface HeaderProps {
  activeTab:    TabId
  onTabChange:  (tab: TabId) => void
}

export default function Header({ activeTab, onTabChange }: HeaderProps) {
  const queryClient        = useQueryClient()
  const { data: logsData } = useLogs({ limit: 500 })
  const currentMapLocation = useViewerStore(s => s.currentMapLocation)
  const setMapLocation     = useViewerStore(s => s.setMapLocation)
  const unlock             = useNavigationStore(s => s.unlock)

  // ユニーク location 一覧
  const locations = useMemo(
    () => [...new Set((logsData?.items ?? []).map(l => l.location))].sort(),
    [logsData],
  )

  const handleLocationChange = useCallback((location: string) => {
    setMapLocation(location)
    unlock()
    queryClient.prefetchQuery({
      queryKey: ['basemap', location],
      queryFn: async () => {
        const res = await fetch(`/api/v1/maps/${location}/basemap`)
        if (!res.ok) throw new Error('basemap fetch failed')
        const blob = await res.blob()
        return createImageBitmap(blob)
      },
      staleTime: Infinity,
    })
  }, [setMapLocation, unlock, queryClient])

  // データ取得後に初期 location をセット（プリフェッチも実行）
  useEffect(() => {
    if (!currentMapLocation && locations.length > 0) {
      handleLocationChange(locations[0])
    }
  }, [locations, currentMapLocation, handleLocationChange])

  const handleTabChange = (tab: TabId) => {
    unlock()
    onTabChange(tab)
  }

  return (
    <header className="flex items-center h-12 bg-black px-3 gap-4 flex-shrink-0">
      {/* Map Selection プルダウン */}
      <div className="flex-shrink-0 w-48">
        <Select
          value={currentMapLocation ?? ''}
          onValueChange={handleLocationChange}
        >
          <SelectTrigger className="h-8 text-xs bg-gray-800 border-gray-600 text-white">
            <SelectValue placeholder="Map Selection" />
          </SelectTrigger>
          <SelectContent>
            {locations.map(loc => (
              <SelectItem key={loc} value={loc} className="text-xs">
                {loc}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* タブ */}
      <nav className="flex items-center gap-1">
        {TABS.map(({ id, label, Icon }) => {
          const isActive = activeTab === id
          const color    = isActive ? ACTIVE_COLOR : INACTIVE_COLOR
          return (
            <button
              key={id}
              onClick={() => handleTabChange(id)}
              className="flex flex-col items-center px-3 py-1 rounded transition-colors gap-0.5"
            >
              <Icon
                width={22}
                height={22}
                style={{ fill: color, color }}
              />
              <span
                className="text-xs font-medium"
                style={{ color }}
              >
                {label}
              </span>
            </button>
          )
        })}
      </nav>
    </header>
  )
}
