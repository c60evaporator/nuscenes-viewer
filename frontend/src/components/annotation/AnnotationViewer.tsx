import MapCanvas from '@/components/common/MapCanvas'
import PointCloudCanvas from '@/components/common/PointCloudCanvas'
import CameraImageCanvas from '@/components/common/CameraImageCanvas'
import { useSampleSensorData, useSampleAnnotations } from '@/api/samples'
import { useInstanceBestCamera } from '@/api/instances'
import type { CalibratedSensor, EgoPosePoint } from '@/types/sensor'

interface AnnotationViewerProps {
  sampleToken:   string | null
  instanceToken: string | null
  location:      string | null
  calibSensorMap: Record<string, CalibratedSensor>
  sceneEgoPoses: EgoPosePoint[]
  onBBoxClick?:  (instanceToken: string) => void
}

function Placeholder({ text }: { text: string }) {
  return (
    <div className="w-full h-full flex items-center justify-center bg-gray-900 text-gray-600 text-xs">
      {text}
    </div>
  )
}

export default function AnnotationViewer({
  sampleToken,
  instanceToken,
  location,
  calibSensorMap,
  sceneEgoPoses,
  onBBoxClick,
}: AnnotationViewerProps) {
  const { data: sampleDataMap }     = useSampleSensorData(sampleToken)
  const { data: sampleAnnotations } = useSampleAnnotations(sampleToken)
  const { data: bestCamera }        = useInstanceBestCamera(instanceToken, sampleToken)

  const currentEgoPose = sampleDataMap?.['LIDAR_TOP']?.ego_pose
    ?? (sampleToken ? sceneEgoPoses.find((p) => p.sample_token === sampleToken) : undefined)

  // LiDAR
  const lidarBrief = sampleDataMap?.['LIDAR_TOP']
  const lidarCalib = calibSensorMap['LIDAR_TOP']
  const lidarCalibArray = lidarCalib ? {
    translation: lidarCalib.translation,
    rotation:    lidarCalib.rotation,
  } : undefined

  // Camera
  const cameraBrief  = bestCamera ? sampleDataMap?.[bestCamera.channel] : undefined
  const cameraCalib  = bestCamera ? calibSensorMap[bestCamera.channel] : undefined
  const cameraEgoPose = cameraBrief?.ego_pose ?? currentEgoPose

  const handleBBoxClick = (annToken: string) => {
    const ann = (sampleAnnotations ?? []).find((a) => a.token === annToken)
    if (ann?.instance_token) onBBoxClick?.(ann.instance_token)
  }

  if (!sampleToken) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        サンプルまたはインスタンスを選択してください
      </div>
    )
  }

  return (
    <div className="flex flex-col w-full h-full">
      {/* 上 2/3: LiDAR + Camera */}
      <div className="flex min-h-0" style={{ flex: '2 0 0' }}>
        {/* LiDAR BEV */}
        <div className="flex-1 min-w-0 relative overflow-hidden bg-gray-900" style={{ borderRight: '1px solid #374151' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, background: 'rgba(0,0,0,0.55)', padding: '1px 4px', fontSize: 9, color: '#aaa', pointerEvents: 'none' }}>LIDAR_TOP</div>
          {lidarBrief ? (
            <PointCloudCanvas
              sampleDataToken={lidarBrief.token}
              annotations={sampleAnnotations ?? []}
              egoPose={currentEgoPose}
              lidarCalibSensor={lidarCalibArray}
              highlightInstanceToken={instanceToken ?? undefined}
              onBBoxClick={handleBBoxClick}
              className="w-full h-full"
            />
          ) : (
            <Placeholder text="No LIDAR_TOP" />
          )}
        </div>

        {/* Camera (best) */}
        <div className="flex-1 min-w-0 relative overflow-hidden bg-gray-900">
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, background: 'rgba(0,0,0,0.55)', padding: '1px 4px', fontSize: 9, color: '#aaa', pointerEvents: 'none' }}>
            {bestCamera?.channel ?? 'CAMERA'}
          </div>
          {bestCamera && cameraCalib ? (
            <CameraImageCanvas
              sampleDataToken={bestCamera.sample_data_token}
              calibratedSensor={cameraCalib}
              egoPose={cameraEgoPose}
              annotations={sampleAnnotations ?? []}
              highlightInstanceToken={instanceToken ?? undefined}
              onBBoxClick={handleBBoxClick}
              className="w-full h-full"
            />
          ) : (
            <Placeholder text="No Camera" />
          )}
        </div>
      </div>

      {/* 下 1/3 */}
      <div className="flex min-h-0" style={{ flex: '1 0 0', borderTop: '1px solid #374151' }}>
        {/* 左: 地図（現在サンプルの ego pose） */}
        <div className="flex-1 min-w-0 relative overflow-hidden" style={{ borderRight: '1px solid #374151' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, background: 'rgba(0,0,0,0.55)', padding: '1px 4px', fontSize: 9, color: '#aaa', pointerEvents: 'none' }}>EGO POSE</div>
          {location && currentEgoPose ? (
            <MapCanvas
              location={location}
              egoPoses={sceneEgoPoses.length > 0 ? sceneEgoPoses : [currentEgoPose]}
              currentIndex={sceneEgoPoses.findIndex((p) => p.sample_token === sampleToken)}
              showStartEnd={false}
              centerPoint={[currentEgoPose.translation[0], currentEgoPose.translation[1]]}
              className="w-full h-full"
            />
          ) : (
            <Placeholder text="No Map" />
          )}
        </div>

        {/* 右: 将来のアノテーションツール用スペース */}
        <div className="flex-1 min-w-0 flex items-center justify-center bg-gray-900">
          <span style={{ color: '#555', fontSize: 11 }}>Annotation Tool (Coming Soon)</span>
        </div>
      </div>
    </div>
  )
}
