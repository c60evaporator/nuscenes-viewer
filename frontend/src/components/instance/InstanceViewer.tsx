import { useMemo } from 'react'
import MapCanvas from '@/components/common/MapCanvas'
import PointCloudCanvas from '@/components/common/PointCloudCanvas'
import CameraImageCanvas from '@/components/common/CameraImageCanvas'
import { useSampleSensorData, useSampleAnnotations } from '@/api/samples'
import { rankCamerasByScore } from '@/lib/cameraSelection'
import type { InstanceAnnotation } from '@/types/annotation'
import type { CalibratedSensor, EgoPosePoint } from '@/types/sensor'

interface InstanceViewerProps {
  instanceToken:     string | null
  currentAnnotation: InstanceAnnotation | null
  allAnnotations:    InstanceAnnotation[]
  location:          string | null
  calibSensorMap:    Record<string, CalibratedSensor>
  sceneEgoPoses:     EgoPosePoint[]
  highlightAnnToken?: string | null
  onBBoxClick?:       (annToken: string) => void
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
  highlightAnnToken,
  onBBoxClick,
}: InstanceViewerProps) {
  const sampleToken = currentAnnotation?.sample_token ?? null

  const { data: sampleDataMap }     = useSampleSensorData(sampleToken)
  const { data: sampleAnnotations } = useSampleAnnotations(sampleToken)

  // 現在サンプルの ego pose（devkit 準拠: LIDAR_TOP の ego_pose を優先）
  const currentEgoPose = (sampleDataMap?.['LIDAR_TOP']?.ego_pose
    ?? (sampleToken ? sceneEgoPoses.find((p) => p.sample_token === sampleToken) : undefined)) as EgoPosePoint | undefined

  // インスタンス全サンプルの ego pose（底部右地図用）
  const instanceEgoPoses: EgoPosePoint[] = allAnnotations
    .map((ann) => sceneEgoPoses.find((p) => p.sample_token === ann.sample_token))
    .filter((p): p is EgoPosePoint => !!p)

  const currentInstanceEgoPoseIndex = allAnnotations.findIndex(
    (ann) => ann.sample_token === sampleToken,
  )

  // LiDAR
  const lidarBrief = sampleDataMap?.['LIDAR_TOP']
  const lidarCalib = lidarBrief?.calibrated_sensor_token
    ? calibSensorMap[lidarBrief.calibrated_sensor_token]
    : undefined
  const lidarCalibArray = lidarCalib ? {
    translation: lidarCalib.translation,
    rotation:    lidarCalib.rotation,
  } : undefined

  // フロント計算によるカメラランキング
  const rankedCameras = useMemo(() => {
    if (!currentAnnotation || !currentEgoPose) return []
    return rankCamerasByScore(
      currentAnnotation.translation,
      currentEgoPose,
      Object.values(calibSensorMap),
    )
  }, [currentAnnotation, currentEgoPose, calibSensorMap])

  const bestCameraSensor = rankedCameras[0]

  // Camera (1st best)
  // rankCamerasByScore でチャンネルを選択し、calibrated_sensor_token で正確なキャリブを取得
  // （calibSensorMap は token キーなので、サンプルデータに紐づく正確なセンサーを参照できる）
  const cameraBrief   = bestCameraSensor ? sampleDataMap?.[bestCameraSensor.channel] : undefined
  const cameraCalib   = cameraBrief?.calibrated_sensor_token
    ? calibSensorMap[cameraBrief.calibrated_sensor_token]
    : undefined
  const cameraEgoPose = cameraBrief?.ego_pose ?? currentEgoPose

  // highlightAnnToken → instance_token（canvas の highlightInstanceToken 用）
  const highlightInstanceToken = useMemo(() => {
    const effectiveAnnToken = highlightAnnToken ?? currentAnnotation?.token
    if (!effectiveAnnToken) return undefined
    const ann = (sampleAnnotations ?? []).find((a) => a.token === effectiveAnnToken)
    return ann?.instance_token
  }, [highlightAnnToken, currentAnnotation?.token, sampleAnnotations])

  if (!currentAnnotation) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        インスタンスを選択してください
      </div>
    )
  }

  return (
    <div className="flex flex-col w-full h-full">
      {/* 上 2/3: Camera + LiDAR */}
      <div className="flex min-h-0" style={{ flex: '2 0 0' }}>
        {/* Camera (best) */}
        <div className="flex-1 min-w-0 relative overflow-hidden bg-gray-900" style={{ borderRight: '1px solid #374151' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, background: 'rgba(0,0,0,0.55)', padding: '1px 4px', fontSize: 9, color: '#aaa', pointerEvents: 'none' }}>
            {bestCameraSensor?.channel ?? 'CAMERA'}
          </div>
          {bestCameraSensor && cameraBrief && cameraCalib ? (
            <CameraImageCanvas
              sampleDataToken={cameraBrief.token}
              calibratedSensor={cameraCalib}
              egoPose={cameraEgoPose}
              annotations={sampleAnnotations ?? []}
              highlightInstanceToken={highlightInstanceToken}
              onBBoxClick={onBBoxClick}
              className="w-full h-full"
            />
          ) : (
            <Placeholder text="No Camera" />
          )}
        </div>

        {/* LiDAR BEV */}
        <div className="flex-1 min-w-0 relative overflow-hidden bg-gray-900">
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, background: 'rgba(0,0,0,0.55)', padding: '1px 4px', fontSize: 9, color: '#aaa', pointerEvents: 'none' }}>LIDAR_TOP</div>
          {lidarBrief ? (
            <PointCloudCanvas
              sampleDataToken={lidarBrief.token}
              annotations={sampleAnnotations ?? []}
              egoPose={currentEgoPose}
              lidarCalibSensor={lidarCalibArray}
              highlightInstanceToken={highlightInstanceToken}
              onBBoxClick={onBBoxClick}
              location={location}
              className="w-full h-full"
            />
          ) : (
            <Placeholder text="No LIDAR_TOP" />
          )}
        </div>
      </div>

      {/* 下 1/3: 地図 × 2 */}
      <div className="flex min-h-0" style={{ flex: '1 0 0', borderTop: '1px solid #374151' }}>
        {/* 左: Scene全軌跡地図（現在 ego pose を強調） */}
        <div className="flex-1 min-w-0 relative overflow-hidden" style={{ borderRight: '1px solid #374151' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, background: 'rgba(0,0,0,0.55)', padding: '1px 4px', fontSize: 9, color: '#aaa', pointerEvents: 'none' }}>EGO POSE (scene)</div>
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

        {/* 右: クロップ地図（全インスタンス ego pose） */}
        <div className="flex-1 min-w-0 relative overflow-hidden">
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, background: 'rgba(0,0,0,0.55)', padding: '1px 4px', fontSize: 9, color: '#aaa', pointerEvents: 'none' }}>EGO POSES (instance)</div>
          {location && instanceEgoPoses.length > 0 ? (
            <MapCanvas
              location={location}
              egoPoses={instanceEgoPoses}
              currentIndex={currentInstanceEgoPoseIndex}
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
