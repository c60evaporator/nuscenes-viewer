import CameraImageCanvas from '@/components/common/CameraImageCanvas'
import PointCloudCanvas from '@/components/common/PointCloudCanvas'
import MapViewer from '@/components/map/MapViewer'
import type { CalibratedSensor, EgoPosePoint, SensorDataMap } from '@/types/sensor'
import type { GeoJSONMapFeature, MapLayer } from '@/types/map'

interface SampleMapViewerProps {
  selectedChannel: string
  sampleDataMap:   SensorDataMap
  calibSensorMap:  Record<string, CalibratedSensor>
  egoPose:         EgoPosePoint | undefined
  mapToken:        string | null
  location:        string | null
  onFeatureClick:  (feature: GeoJSONMapFeature, layer: MapLayer) => void
}

function Placeholder({ text }: { text: string }) {
  return (
    <div className="w-full h-full flex items-center justify-center bg-gray-900 text-gray-600 text-xs">
      {text}
    </div>
  )
}

export default function SampleMapViewer({
  selectedChannel,
  sampleDataMap,
  calibSensorMap,
  egoPose,
  mapToken,
  location,
  onFeatureClick,
}: SampleMapViewerProps) {
  const sensorBrief  = sampleDataMap[selectedChannel]
  const cameraCalib  = calibSensorMap[selectedChannel]
  const lidarCalib   = calibSensorMap[selectedChannel]
  const isCamera     = selectedChannel.startsWith('CAM_')
  const isLidar      = selectedChannel === 'LIDAR_TOP' || selectedChannel === 'FUSED_RADER'

  const lidarCalibArray = lidarCalib ? {
    translation: [lidarCalib.translation.x, lidarCalib.translation.y, lidarCalib.translation.z],
    rotation:    [lidarCalib.rotation.w,    lidarCalib.rotation.x,    lidarCalib.rotation.y,    lidarCalib.rotation.z],
  } : undefined

  return (
    <div className="flex flex-col w-full h-full">
      {/* 上 2/3: センサー画像 */}
      <div
        className="relative min-h-0 overflow-hidden bg-gray-900"
        style={{ flex: '2 0 0', borderBottom: '1px solid #374151' }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, background: 'rgba(0,0,0,0.55)', padding: '1px 4px', fontSize: 9, color: '#aaa', pointerEvents: 'none' }}>
          {selectedChannel}
        </div>

        {isCamera && sensorBrief && cameraCalib ? (
          <CameraImageCanvas
            sampleDataToken={sensorBrief.token}
            calibratedSensor={cameraCalib}
            egoPose={egoPose}
            annotations={[]}
            className="w-full h-full"
          />
        ) : isLidar && sensorBrief ? (
          <PointCloudCanvas
            sampleDataToken={sensorBrief.token}
            egoPose={egoPose}
            lidarCalibSensor={lidarCalibArray}
            annotations={[]}
            className="w-full h-full"
          />
        ) : (
          <Placeholder text={sensorBrief ? 'Loading...' : `No ${selectedChannel}`} />
        )}
      </div>

      {/* 下 1/3 */}
      <div className="flex min-h-0" style={{ flex: '1 0 0' }}>
        {/* 左: MapViewer（Map Expansion + Ego Pose） */}
        <div className="flex-1 min-w-0 overflow-hidden" style={{ borderRight: '1px solid #374151' }}>
          <MapViewer
            mapToken={mapToken}
            location={location}
            onFeatureClick={onFeatureClick}
          />
        </div>

        {/* 右: 将来のアノテーションツール用スペース */}
        <div className="flex-1 min-w-0 flex items-center justify-center bg-gray-900">
          <span style={{ color: '#555', fontSize: 11 }}>Annotation Tool (Coming Soon)</span>
        </div>
      </div>
    </div>
  )
}
