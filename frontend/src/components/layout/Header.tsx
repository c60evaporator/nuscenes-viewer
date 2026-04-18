import { useEffect, useMemo } from 'react'
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

export type TabId = 'scene' | 'sample' | 'instance' | 'annotation' | 'map' | 'sample-map'

export const TABS: { id: TabId; label: string }[] = [
  { id: 'scene',      label: 'Scene' },
  { id: 'sample',     label: 'Sample' },
  { id: 'instance',   label: 'Instance' },
  { id: 'annotation', label: 'Annotation' },
  { id: 'map',        label: 'Map' },
  { id: 'sample-map', label: 'Sample&Map' },
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

  const handleLocationChange = (location: string) => {
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
  }

  // データ取得後に初期 location をセット（プリフェッチも実行）
  useEffect(() => {
    if (!currentMapLocation && locations.length > 0) {
      handleLocationChange(locations[0])
    }
  }, [locations, currentMapLocation])

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
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className="px-3 py-1 text-sm font-medium rounded transition-colors"
            style={{
              color: activeTab === tab.id ? '#4A90D9' : '#ffffff',
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </header>
  )
}
