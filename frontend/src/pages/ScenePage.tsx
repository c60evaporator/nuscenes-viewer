import { useEffect, useMemo, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import LeftPane from '@/components/layout/LeftPane'
import RightPane from '@/components/layout/RightPane'
import SceneFilter from '@/components/scene/SceneFilter'
import SceneList from '@/components/scene/SceneList'
import SceneInfo from '@/components/scene/SceneInfo'
import SceneViewer from '@/components/scene/SceneViewer'
import AddSceneModal from '@/components/scene/AddSceneModal'
import { Button } from '@/components/ui/button'
import { useScenes } from '@/api/scenes'
import { useLogsByLocation } from '@/api/logs'
import { useMaps } from '@/api/maps'
import { useSensors } from '@/api/sensors'
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
  const [addSceneOpen, setAddSceneOpen] = useState(false)
  // Import 成功後、新 scene 名を保持 → 再フェッチ後に token 解決してスクロール＆選択
  const [pendingScrollName, setPendingScrollName] = useState<string | null>(null)
  const [scrollToToken, setScrollToToken] = useState<string | null>(null)

  const currentMapLocation = useViewerStore((s) => s.currentMapLocation)
  const currentSceneToken  = useViewerStore((s) => s.currentSceneToken)
  const setScene           = useViewerStore((s) => s.setScene)
  const lock               = useNavigationStore((s) => s.lock)

  const { data: logsData   } = useLogsByLocation(currentMapLocation)
  const { data: scenesData } = useScenes({ limit: 500 })
  const { data: mapsData    } = useMaps({ limit: 100 })
  const { data: sensorsData } = useSensors()

  // バリデーション用の参照セット
  const validLocations = useMemo(
    () => new Set((mapsData?.items ?? []).map((m) => m.location)),
    [mapsData],
  )
  const validSensorTokens = useMemo(
    () => new Set((sensorsData?.items ?? []).map((s) => s.token)),
    [sensorsData],
  )
  // 参照データ（location / sensor）が揃うまではバリデーションを走らせない
  const refDataReady = !!mapsData && !!sensorsData

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

  // Import 後: 再フェッチされた一覧から新 scene の token を解決し、選択＆スクロール
  useEffect(() => {
    if (!pendingScrollName) return
    const added = filteredScenes.find((s) => s.name === pendingScrollName)
    if (added) {
      setScene(added.token)
      setScrollToToken(added.token)
      setPendingScrollName(null)
    }
  }, [pendingScrollName, filteredScenes, setScene])

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
          onClick={() => setAddSceneOpen(true)}
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
            scrollToToken={scrollToToken}
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
      <AddSceneModal
        open={addSceneOpen}
        onClose={() => setAddSceneOpen(false)}
        validLocations={validLocations}
        validSensorTokens={validSensorTokens}
        refReady={refDataReady}
        onImported={(r) => setPendingScrollName(r.added_scene_names[0] ?? null)}
      />
    </MainLayout>
  )
}
