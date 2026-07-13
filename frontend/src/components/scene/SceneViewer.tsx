import MapCanvas from '@/components/common/MapCanvas'
import { useSceneEgoPoses, useAllScenesEgoPoses } from '@/api/scenes'

interface SceneViewerProps {
  sceneToken:      string | null
  location:        string | null
  allSceneTokens?: string[]   // 同一ロケーション内の全シーントークン（背景表示用）
  onSceneClick?:   (sceneToken: string) => void  // 背景 Waypoint クリックでシーン選択
}

export default function SceneViewer({ sceneToken, location, allSceneTokens, onSceneClick }: SceneViewerProps) {
  const { data: egoPoses } = useSceneEgoPoses(sceneToken)
  const { data: bgGroups } = useAllScenesEgoPoses(allSceneTokens ?? [])

  if (!location) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        Please select a scene to view the map.
      </div>
    )
  }

  return (
    <MapCanvas
      location={location}
      egoPoses={egoPoses ?? []}
      showStartEnd={true}
      centerPoint={null}
      fitToMap={true}
      backgroundEgoPoseGroups={bgGroups.map((g) => g.poses)}
      onBackgroundGroupClick={
        onSceneClick
          ? (i) => { if (bgGroups[i]) onSceneClick(bgGroups[i].token) }
          : undefined
      }
      className="flex-1 w-full h-full"
    />
  )
}
