import MapCanvas from '@/components/common/MapCanvas'
import { useSceneEgoPoses } from '@/api/scenes'

interface SceneViewerProps {
  sceneToken: string | null
  location:   string | null
}

export default function SceneViewer({ sceneToken, location }: SceneViewerProps) {
  const { data: egoPoses, isLoading } = useSceneEgoPoses(sceneToken)

  if (!location) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        Map を選択してください
      </div>
    )
  }

  if (!sceneToken) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        シーンを選択してください
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        Loading...
      </div>
    )
  }

  const centerPoint: [number, number] | null = egoPoses && egoPoses.length > 0
    ? (() => {
        const mid = egoPoses[Math.floor(egoPoses.length / 2)]
        return [mid.translation[0], mid.translation[1]] as [number, number]
      })()
    : null

  return (
    <MapCanvas
      location={location}
      egoPoses={egoPoses ?? []}
      showStartEnd={true}
      centerPoint={centerPoint}
      className="flex-1 w-full h-full"
    />
  )
}
