import { Group, Panel, Separator } from 'react-resizable-panels'
import MapCanvas from '@/components/common/MapCanvas'
import PointCloudCanvas from '@/components/common/PointCloudCanvas'
import CameraImageCanvas from '@/components/common/CameraImageCanvas'
import AnnotationThreeView from '@/components/annotation/AnnotationThreeView'
import { useSampleSensorData, useSampleAnnotations } from '@/api/samples'
import { getSampleEgoPose } from '@/lib/egoPoseUtils'
import type { CalibratedSensor, EgoPosePoint } from '@/types/sensor'
import type { Annotation } from '@/types/annotation'

const H_SEP = 'h-1 bg-[#374151] hover:bg-blue-400 cursor-row-resize transition-colors'
const V_SEP = 'w-1 bg-[#374151] hover:bg-blue-400 cursor-col-resize transition-colors'

interface AnnotationViewerProps {
  sampleToken:   string | null
  instanceToken: string | null
  cameraChannel: string | null   // 表示するカメラチャンネル（左ペイン Sensor フィルタで制御）
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
  cameraChannel,
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

  const currentEgoPose = getSampleEgoPose(sampleDataMap, sceneEgoPoses, sampleToken)

  // LiDAR
  const lidarBrief = sampleDataMap?.['LIDAR_TOP']
  const lidarCalib = lidarBrief?.calibrated_sensor_token
    ? calibSensorMap[lidarBrief.calibrated_sensor_token]
    : undefined
  const lidarCalibArray = lidarCalib ? {
    translation: lidarCalib.translation,
    rotation:    lidarCalib.rotation,
  } : undefined

  // Camera（左ペイン Sensor フィルタで選択されたチャンネルを表示）
  const cameraBrief   = cameraChannel ? sampleDataMap?.[cameraChannel] : undefined
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
        Please select a sample or an instance
      </div>
    )
  }

  return (
    <Group orientation="horizontal" className="w-full h-full">
      {/* 左列: カメラ + Map */}
      <Panel defaultSize={50}>
        <Group orientation="vertical" className="h-full">
          {/* 最適カメラ */}
          <Panel defaultSize={50}>
            <div className="w-full h-full relative overflow-hidden bg-gray-900">
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, background: 'rgba(0,0,0,0.55)', padding: '1px 4px', fontSize: 9, color: '#aaa', pointerEvents: 'none' }}>
                {cameraChannel ?? 'CAMERA'}
              </div>
              {cameraBrief && cameraCalib ? (
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
                <Placeholder text="No camera image" />
              )}
            </div>
          </Panel>

          <Separator className={H_SEP} />

          {/* 地図（現在サンプルの ego pose） */}
          <Panel defaultSize={50}>
            <div className="w-full h-full relative overflow-hidden">
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
          </Panel>
        </Group>
      </Panel>

      <Separator className={V_SEP} />

      {/* 右列: LIDAR + Three.js 3D VIEW */}
      <Panel defaultSize={50}>
        <Group orientation="vertical" className="h-full">
          {/* LIDAR BEV */}
          <Panel defaultSize={50}>
            <div className="w-full h-full relative overflow-hidden bg-gray-900">
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
          </Panel>

          <Separator className={H_SEP} />

          {/* Three.js 3D点群表示 */}
          <Panel defaultSize={50}>
            <div className="w-full h-full relative overflow-hidden bg-gray-900">
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, background: 'rgba(0,0,0,0.55)', padding: '1px 4px', fontSize: 9, color: '#aaa', pointerEvents: 'none' }}>
                3D VIEW
              </div>
              {lidarBrief ? (
                <AnnotationThreeView
                  sampleDataToken={lidarBrief.token}
                  annotations={sampleAnnotations}
                  egoPose={currentEgoPose}
                  lidarCalibSensor={lidarCalibArray}
                  highlightInstanceToken={instanceToken ?? undefined}
                  editingInstanceToken={editingInstanceToken}
                  onBBoxClick={handleBBoxClick}
                />
              ) : (
                <Placeholder text="No LIDAR_TOP" />
              )}
            </div>
          </Panel>
        </Group>
      </Panel>
    </Group>
  )
}
