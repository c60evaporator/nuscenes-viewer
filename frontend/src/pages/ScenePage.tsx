import { useMemo, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import LeftPane from '@/components/layout/LeftPane'
import RightPane from '@/components/layout/RightPane'
import SceneFilter from '@/components/scene/SceneFilter'
import SceneList from '@/components/scene/SceneList'
import SceneInfo from '@/components/scene/SceneInfo'
import SceneViewer from '@/components/scene/SceneViewer'
import { Button } from '@/components/ui/button'
import { useScenes } from '@/api/scenes'
import { useLogsByLocation } from '@/api/logs'
import { useViewerStore } from '@/store/viewerStore'
import { useNavigationStore } from '@/store/navigationStore'
import type { TabId } from '@/components/layout/Header'

interface ScenePageProps {
  activeTab:   TabId
  onTabChange: (tab: TabId) => void
}

export default function ScenePage({ activeTab, onTabChange }: ScenePageProps) {
  const [selectedLogToken, setSelectedLogToken] = useState<string | null>(null)

  const currentMapLocation = useViewerStore((s) => s.currentMapLocation)
  const currentSceneToken  = useViewerStore((s) => s.currentSceneToken)
  const setScene           = useViewerStore((s) => s.setScene)
  const lock               = useNavigationStore((s) => s.lock)

  const { data: logsData   } = useLogsByLocation(currentMapLocation)
  const { data: scenesData } = useScenes({ limit: 500 })

  const logs = logsData ?? []

  // ロケーション内の log token セット
  const locationLogTokens = useMemo(
    () => new Set(logs.map((l) => l.token)),
    [logs],
  )

  // ロケーション絞り込み → Log フィルタ → 名前順ソート
  const filteredScenes = useMemo(() => {
    const all = scenesData?.items ?? []
    return all
      .filter((s) => locationLogTokens.has(s.log_token))
      .filter((s) => selectedLogToken === null || s.log_token === selectedLogToken)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [scenesData, locationLogTokens, selectedLogToken])

  // 選択中の Scene
  const selectedScene = useMemo(
    () => filteredScenes.find((s) => s.token === currentSceneToken) ?? null,
    [filteredScenes, currentSceneToken],
  )

  const navigate = (tab: TabId) => {
    if (!currentSceneToken) return
    lock('scene', { sceneToken: currentSceneToken })
    onTabChange(tab)
  }

  const navButtons = (
    <>
      <Button
        className="w-full text-white text-xs"
        style={{ backgroundColor: '#4A90D9' }}
        disabled={!currentSceneToken}
        onClick={() => navigate('sample')}
      >
        Samples
      </Button>
      <Button
        className="w-full text-white text-xs"
        style={{ backgroundColor: '#4A90D9' }}
        disabled={!currentSceneToken}
        onClick={() => navigate('instance')}
      >
        Instances
      </Button>
      <Button
        className="w-full text-white text-xs"
        style={{ backgroundColor: '#4A90D9' }}
        disabled={!currentSceneToken}
        onClick={() => navigate('sample-map')}
      >
        Sample&amp;Map
      </Button>
    </>
  )

  return (
    <MainLayout
      activeTab={activeTab}
      onTabChange={onTabChange}
      left={
        <LeftPane
          filter={
            <SceneFilter
              logs={logs}
              selectedLogToken={selectedLogToken}
              onFilterChange={setSelectedLogToken}
            />
          }
        >
          <SceneList
            scenes={filteredScenes}
            currentSceneToken={currentSceneToken}
            onSelect={setScene}
          />
        </LeftPane>
      }
      right={
        <RightPane actions={navButtons}>
          <SceneInfo scene={selectedScene} />
        </RightPane>
      }
    >
      <SceneViewer sceneToken={currentSceneToken} location={currentMapLocation} />
    </MainLayout>
  )
}
