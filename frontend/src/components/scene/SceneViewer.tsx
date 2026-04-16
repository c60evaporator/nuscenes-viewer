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

  return (
    <MapCanvas
      location={location}
      egoPoses={egoPoses ?? []}
      showStartEnd={true}
      className="flex-1 w-full h-full"
    />
  )
}
