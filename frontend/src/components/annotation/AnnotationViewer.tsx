import { useMemo } from 'react'
import MapCanvas from '@/components/common/MapCanvas'
import PointCloudCanvas from '@/components/common/PointCloudCanvas'
import CameraImageCanvas from '@/components/common/CameraImageCanvas'
import { useSampleSensorData, useSampleAnnotations } from '@/api/samples'
import { useEditStore } from '@/store/editStore'
import { rankCamerasByScore } from '@/lib/cameraSelection'
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

  const currentAnnotation = useEditStore((s) => s.getCurrentAnnotation())

  // 編集中BBox優先、なければ instanceToken 経由でリストから探す
  const targetAnnotation = useMemo(() => {
    if (currentAnnotation) return currentAnnotation
    if (instanceToken) {
      return (sampleAnnotationsRaw ?? []).find((a) => a.instance_token === instanceToken) ?? null
    }
    return null
  }, [currentAnnotation, instanceToken, sampleAnnotationsRaw])

  const currentEgoPose = (sampleDataMap?.['LIDAR_TOP']?.ego_pose
    ?? (sampleToken ? sceneEgoPoses.find((p) => p.sample_token === sampleToken) : undefined)) as EgoPosePoint | undefined

  // LiDAR
  // calibSensorMap は token キーなので、sampleDataMap の calibrated_sensor_token で引く
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
    if (!targetAnnotation || !currentEgoPose) return []
    return rankCamerasByScore(
      targetAnnotation.translation,
      currentEgoPose,
      Object.values(calibSensorMap),
    )
  }, [targetAnnotation, currentEgoPose, calibSensorMap])

  const bestCameraSensor = rankedCameras[0]

  // Camera (1st best)
  // チャンネル選択後、calibrated_sensor_token でサンプルに紐づく正確なキャリブを取得
  const cameraBrief   = bestCameraSensor ? sampleDataMap?.[bestCameraSensor.channel] : undefined
  const cameraCalib   = cameraBrief?.calibrated_sensor_token
    ? calibSensorMap[cameraBrief.calibrated_sensor_token]
    : undefined
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
    <div className="flex w-full h-full">
      {/* 左列: カメラ × 2 + Map（各 1/3） */}
      <div className="flex-1 min-w-0 flex flex-col" style={{ borderRight: '1px solid #374151' }}>
        {/* 1番目に映りの良いカメラ */}
        <div className="flex-1 min-h-0 relative overflow-hidden bg-gray-900" style={{ borderBottom: '1px solid #374151' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, background: 'rgba(0,0,0,0.55)', padding: '1px 4px', fontSize: 9, color: '#aaa', pointerEvents: 'none' }}>
            {bestCameraSensor?.channel ?? 'CAMERA'}
          </div>
          {bestCameraSensor && cameraBrief && cameraCalib ? (
            <CameraImageCanvas
              sampleDataToken={cameraBrief.token}
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

        {/* 2番目のカメラスロット (Step 4 追加でカメラ表示は1枠のみに変更、レイアウト再編は別Step) */}
        <div className="flex-1 min-h-0 relative overflow-hidden bg-gray-900" style={{ borderBottom: '1px solid #374151' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, background: 'rgba(0,0,0,0.55)', padding: '1px 4px', fontSize: 9, color: '#aaa', pointerEvents: 'none' }}>
            CAMERA 2
          </div>
          <Placeholder text="Camera 2 (removed)" />
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
