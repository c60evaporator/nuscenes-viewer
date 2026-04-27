import MapCanvas from '@/components/common/MapCanvas'
import PointCloudCanvas from '@/components/common/PointCloudCanvas'
import CameraImageCanvas from '@/components/common/CameraImageCanvas'
import { useSampleSensorData, useSampleAnnotations } from '@/api/samples'
import { useInstanceBestCamera } from '@/api/instances'
import type { CalibratedSensor, EgoPosePoint } from '@/types/sensor'
import type { Annotation } from '@/types/annotation'

interface AnnotationViewerProps {
  sampleToken:   string | null
  instanceToken: string | null
  location:      string | null
  calibSensorMap: Record<string, CalibratedSensor>
  sceneEgoPoses: EgoPosePoint[]
  onBBoxClick?:  (instanceToken: string) => void
  editingInstanceToken?: string
  workingAnnotation?:    Annotation | null
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
  editingInstanceToken,
  workingAnnotation,
}: AnnotationViewerProps) {
  const { data: sampleDataMap }      = useSampleSensorData(sampleToken)
  const { data: sampleAnnotationsRaw } = useSampleAnnotations(sampleToken)

  // 追加モード時: workingAnnotation を末尾に追加して描画
  const sampleAnnotations = workingAnnotation
    ? [...(sampleAnnotationsRaw ?? []), workingAnnotation]
    : (sampleAnnotationsRaw ?? [])
  const { data: bestCamera }         = useInstanceBestCamera(instanceToken, sampleToken, 1)
  const { data: secondBestCamera }   = useInstanceBestCamera(instanceToken, sampleToken, 2)

  const currentEgoPose = (sampleDataMap?.['LIDAR_TOP']?.ego_pose
    ?? (sampleToken ? sceneEgoPoses.find((p) => p.sample_token === sampleToken) : undefined)) as EgoPosePoint | undefined

  // LiDAR
  const lidarBrief = sampleDataMap?.['LIDAR_TOP']
  const lidarCalib = calibSensorMap['LIDAR_TOP']
  const lidarCalibArray = lidarCalib ? {
    translation: lidarCalib.translation,
    rotation:    lidarCalib.rotation,
  } : undefined

  // Camera (1st best)
  const cameraBrief   = bestCamera ? sampleDataMap?.[bestCamera.channel] : undefined
  const cameraCalib   = bestCamera ? calibSensorMap[bestCamera.channel] : undefined
  const cameraEgoPose = cameraBrief?.ego_pose ?? currentEgoPose

  // Camera (2nd best)
  const camera2Brief   = secondBestCamera ? sampleDataMap?.[secondBestCamera.channel] : undefined
  const camera2Calib   = secondBestCamera ? calibSensorMap[secondBestCamera.channel] : undefined
  const camera2EgoPose = camera2Brief?.ego_pose ?? currentEgoPose

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
    <div className="flex w-full h-full">
      {/* 左列: カメラ × 2 + Map（各 1/3） */}
      <div className="flex-1 min-w-0 flex flex-col" style={{ borderRight: '1px solid #374151' }}>
        {/* 1番目に映りの良いカメラ */}
        <div className="flex-1 min-h-0 relative overflow-hidden bg-gray-900" style={{ borderBottom: '1px solid #374151' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, background: 'rgba(0,0,0,0.55)', padding: '1px 4px', fontSize: 9, color: '#aaa', pointerEvents: 'none' }}>
            {bestCamera?.channel ?? 'CAMERA'}
          </div>
          {bestCamera && cameraCalib ? (
            <CameraImageCanvas
              sampleDataToken={bestCamera.sample_data_token}
              calibratedSensor={cameraCalib}
              egoPose={cameraEgoPose}
              annotations={sampleAnnotations}
              highlightInstanceToken={instanceToken ?? undefined}
              editingInstanceToken={editingInstanceToken}
              onBBoxClick={handleBBoxClick}
              className="w-full h-full"
            />
          ) : (
            <Placeholder text="No Camera" />
          )}
        </div>

        {/* 2番目に映りの良いカメラ */}
        <div className="flex-1 min-h-0 relative overflow-hidden bg-gray-900" style={{ borderBottom: '1px solid #374151' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, background: 'rgba(0,0,0,0.55)', padding: '1px 4px', fontSize: 9, color: '#aaa', pointerEvents: 'none' }}>
            {secondBestCamera?.channel ?? 'CAMERA 2'}
          </div>
          {secondBestCamera && camera2Calib ? (
            <CameraImageCanvas
              sampleDataToken={secondBestCamera.sample_data_token}
              calibratedSensor={camera2Calib}
              egoPose={camera2EgoPose}
              annotations={sampleAnnotations}
              highlightInstanceToken={instanceToken ?? undefined}
              editingInstanceToken={editingInstanceToken}
              onBBoxClick={handleBBoxClick}
              className="w-full h-full"
            />
          ) : (
            <Placeholder text="No Camera 2" />
          )}
        </div>

        {/* 地図（現在サンプルの ego pose） */}
        <div className="flex-1 min-h-0 relative overflow-hidden">
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
      </div>

      {/* 右列: LIDAR（上 1/2） + Three.js 予約スペース（下 1/2） */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* LIDAR BEV */}
        <div className="flex-1 min-h-0 relative overflow-hidden bg-gray-900" style={{ borderBottom: '1px solid #374151' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, background: 'rgba(0,0,0,0.55)', padding: '1px 4px', fontSize: 9, color: '#aaa', pointerEvents: 'none' }}>LIDAR_TOP</div>
          {lidarBrief ? (
            <PointCloudCanvas
              sampleDataToken={lidarBrief.token}
              annotations={sampleAnnotations}
              egoPose={currentEgoPose}
              lidarCalibSensor={lidarCalibArray}
              highlightInstanceToken={instanceToken ?? undefined}
              editingInstanceToken={editingInstanceToken}
              onBBoxClick={handleBBoxClick}
              className="w-full h-full"
            />
          ) : (
            <Placeholder text="No LIDAR_TOP" />
          )}
        </div>

        {/* Three.js 3D点群表示 予約スペース */}
        <div className="flex-1 min-h-0 flex items-center justify-center bg-gray-900">
          <span style={{ color: '#555', fontSize: 11 }}>3D Point Cloud - Three.js (Coming Soon)</span>
        </div>
      </div>
    </div>
  )
}
