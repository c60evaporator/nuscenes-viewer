import MapCanvas from '@/components/common/MapCanvas'
import PointCloudCanvas from '@/components/common/PointCloudCanvas'
import CameraImageCanvas from '@/components/common/CameraImageCanvas'
import { useSampleSensorData, useSampleAnnotations } from '@/api/samples'
import { useInstanceBestCamera } from '@/api/instances'
import type { InstanceAnnotation } from '@/types/annotation'
import type { CalibratedSensor, EgoPosePoint } from '@/types/sensor'

interface InstanceViewerProps {
  instanceToken:    string | null
  currentAnnotation: InstanceAnnotation | null  // slider で選択中
  allAnnotations:   InstanceAnnotation[]        // 全インスタンスアノテーション
  location:         string | null
  calibSensorMap:   Record<string, CalibratedSensor>
  sceneEgoPoses:    EgoPosePoint[]
}

function Placeholder({ text }: { text: string }) {
  return (
    <div className="w-full h-full flex items-center justify-center bg-gray-900 text-gray-600 text-xs">
      {text}
    </div>
  )
}

export default function InstanceViewer({
  instanceToken,
  currentAnnotation,
  allAnnotations,
  location,
  calibSensorMap,
  sceneEgoPoses,
}: InstanceViewerProps) {
  const sampleToken = currentAnnotation?.sample_token ?? null

  const { data: sampleDataMap }   = useSampleSensorData(sampleToken)
  const { data: sampleAnnotations } = useSampleAnnotations(sampleToken)
  const { data: bestCamera }      = useInstanceBestCamera(instanceToken, sampleToken)

  // 現在サンプルの ego pose
  const currentEgoPose = sampleToken
    ? sceneEgoPoses.find((p) => p.sample_token === sampleToken)
    : undefined

  // インスタンス全サンプルの ego pose（底部右地図用）
  const instanceEgoPoses: EgoPosePoint[] = allAnnotations
    .map((ann) => sceneEgoPoses.find((p) => p.sample_token === ann.sample_token))
    .filter((p): p is EgoPosePoint => !!p)

  const currentInstanceEgoPoseIndex = allAnnotations.findIndex(
    (ann) => ann.sample_token === sampleToken,
  )

  // LiDAR
  const lidarBrief   = sampleDataMap?.['LIDAR_TOP']
  const lidarCalib   = calibSensorMap['LIDAR_TOP']
  const lidarCalibArray = lidarCalib ? {
    translation: lidarCalib.translation,
    rotation:    lidarCalib.rotation,
  } : undefined

  // Camera
  const cameraCalib  = bestCamera ? calibSensorMap[bestCamera.channel] : undefined

  if (!currentAnnotation) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        インスタンスを選択してください
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
              highlightAnnToken={currentAnnotation.token}
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
              egoPose={currentEgoPose}
              annotations={sampleAnnotations ?? []}
              highlightToken={currentAnnotation.token}
              className="w-full h-full"
            />
          ) : (
            <Placeholder text="No Camera" />
          )}
        </div>
      </div>

      {/* 下 1/3: 地図 × 2 */}
      <div className="flex min-h-0" style={{ flex: '1 0 0', borderTop: '1px solid #374151' }}>
        {/* 左: 全体地図（現在 ego pose のみ） */}
        <div className="flex-1 min-w-0 relative overflow-hidden" style={{ borderRight: '1px solid #374151' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, background: 'rgba(0,0,0,0.55)', padding: '1px 4px', fontSize: 9, color: '#aaa', pointerEvents: 'none' }}>EGO POSE (current)</div>
          {location && currentEgoPose ? (
            <MapCanvas
              location={location}
              egoPoses={[currentEgoPose]}
              currentIndex={0}
              showStartEnd={false}
              centerPoint={[currentEgoPose.translation[0], currentEgoPose.translation[1]]}
              className="w-full h-full"
            />
          ) : (
            <Placeholder text="No Map" />
          )}
        </div>

        {/* 右: クロップ地図（全インスタンス ego pose） */}
        <div className="flex-1 min-w-0 relative overflow-hidden">
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, background: 'rgba(0,0,0,0.55)', padding: '1px 4px', fontSize: 9, color: '#aaa', pointerEvents: 'none' }}>EGO POSES (instance)</div>
          {location && instanceEgoPoses.length > 0 ? (
            <MapCanvas
              location={location}
              egoPoses={instanceEgoPoses}
              currentIndex={currentInstanceEgoPoseIndex}
              cropToContent={true}
              showStartEnd={false}
              className="w-full h-full"
            />
          ) : (
            <Placeholder text="No Map" />
          )}
        </div>
      </div>
    </div>
  )
}
