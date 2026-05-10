import MapCanvas from '@/components/common/MapCanvas'
import { useSceneEgoPoses, useAllScenesEgoPoses } from '@/api/scenes'

interface SceneViewerProps {
  sceneToken:      string | null
  location:        string | null
  allSceneTokens?: string[]   // 同一ロケーション内の全シーントークン（背景表示用）
}

export default function SceneViewer({ sceneToken, location, allSceneTokens }: SceneViewerProps) {
  const { data: egoPoses } = useSceneEgoPoses(sceneToken)
  const { data: bgGroups } = useAllScenesEgoPoses(allSceneTokens ?? [])

  if (!location) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        Map を選択してください
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
      backgroundEgoPoseGroups={bgGroups}
      className="flex-1 w-full h-full"
    />
  )
}
