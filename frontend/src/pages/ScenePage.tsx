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
import { downloadNuscenesExport } from '@/api/export'
import { useViewerStore } from '@/store/viewerStore'
import { useNavigationStore } from '@/store/navigationStore'
import type { TabId } from '@/components/layout/Header'

interface ScenePageProps {
  activeTab:   TabId
  onTabChange: (tab: TabId) => void
}

export default function ScenePage({ activeTab, onTabChange }: ScenePageProps) {
  const [selectedLogToken, setSelectedLogToken] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const currentMapLocation = useViewerStore((s) => s.currentMapLocation)
  const currentSceneToken  = useViewerStore((s) => s.currentSceneToken)
  const setScene           = useViewerStore((s) => s.setScene)
  const lock               = useNavigationStore((s) => s.lock)

  const { data: logsData   } = useLogsByLocation(currentMapLocation)
  const { data: scenesData } = useScenes({ limit: 500 })

  // ロケーション内の log token セット
  const locationLogTokens = useMemo(
    () => new Set((logsData ?? []).map((l) => l.token)),
    [logsData],
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

  const handleExport = async (token: string | null) => {
    // 全シーン export の場合は確認ダイアログを表示
    if (token === null) {
      const ok = window.confirm(
        'Exporting all scenes may take several minutes for large datasets. Continue?'
      )
      if (!ok) return
    }

    try {
      setExporting(true)
      const { warningCount } = await downloadNuscenesExport(token)
      if (warningCount > 0) {
        alert(
          `Export completed with ${warningCount} warning(s). ` +
          `Please check WARNINGS.txt inside the ZIP file for details.`
        )
      }
    } catch (e) {
      alert(`Export failed: ${e instanceof Error ? e.message : 'Unknown error'}`)
    } finally {
      setExporting(false)
    }
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

  const exportButtons = (
    <div className="p-3 flex flex-col gap-2">
      <div className="flex flex-row gap-2">
        <Button
          size="sm"
          className="flex-1 text-white text-[11px]"
          style={{ backgroundColor: '#4A90D9' }}
          disabled
        >
          Add Scene
        </Button>
        <Button
          size="sm"
          className="flex-1 text-white text-[11px]"
          style={{ backgroundColor: '#C0392B' }}
          disabled={!currentSceneToken}
        >
          Delete Scene
        </Button>
      </div>
      <div className="flex flex-row gap-2">
      <Button
        size="sm"
        className="flex-1 text-white text-[11px]"
        style={{ backgroundColor: '#4A90D9' }}
        disabled={!currentSceneToken || exporting}
        onClick={() => handleExport(currentSceneToken)}
      >
        {exporting ? 'Exporting...' : 'Export Scene JSON'}
      </Button>
      <Button
        size="sm"
        className="flex-1 text-white text-[11px]"
        style={{ backgroundColor: '#2D6FA8' }}
        disabled={exporting}
        onClick={() => handleExport(null)}
      >
        {exporting ? 'Exporting...' : 'Export All Scenes'}
      </Button>
      </div>
    </div>
  )

  return (
    <MainLayout
      activeTab={activeTab}
      onTabChange={onTabChange}
      left={
        <LeftPane
          filter={
            <SceneFilter
              logs={logsData ?? []}
              selectedLogToken={selectedLogToken}
              onFilterChange={setSelectedLogToken}
            />
          }
          footer={exportButtons}
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
      <SceneViewer
        sceneToken={currentSceneToken}
        location={currentMapLocation}
        allSceneTokens={filteredScenes.map((s) => s.token)}
      />
    </MainLayout>
  )
}
