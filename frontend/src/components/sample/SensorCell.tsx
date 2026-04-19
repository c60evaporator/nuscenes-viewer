import MapCanvas from '@/components/common/MapCanvas'
import PointCloudCanvas from '@/components/common/PointCloudCanvas'
import CameraImageCanvas from '@/components/common/CameraImageCanvas'
import { useSensorDataEgoPose } from '@/api/sensorData'
import type { Annotation } from '@/types/annotation'
import type { CalibratedSensor, EgoPosePoint, SensorDataMap } from '@/types/sensor'

interface SensorCellProps {
  channel:           string
  sampleToken:       string | null
  sampleDataMap:     SensorDataMap
  annotations:       Annotation[]
  egoPoses:          EgoPosePoint[]
  calibSensorMap:    Record<string, CalibratedSensor>
  location:          string | null
  onBBoxClick:       (annToken: string) => void
  highlightAnnToken?: string
}

export default function SensorCell({
  channel,
  sampleToken,
  sampleDataMap,
  annotations,
  egoPoses,
  calibSensorMap,
  location,
  onBBoxClick,
  highlightAnnToken,
}: SensorCellProps) {
  // devkit 準拠: LIDAR_TOP の ego_pose を全センサーの基準とする
  const lidarBriefForEgo = sampleDataMap['LIDAR_TOP']
  const currentEgoPose = lidarBriefForEgo?.ego_pose
    ?? (sampleToken ? egoPoses.find((p) => p.sample_token === sampleToken) : undefined)
    ?? egoPoses[0]

  // カメラチャンネルの場合のみ、そのカメラ自身の ego_pose を取得
  const camBrief = channel.startsWith('CAM_') ? sampleDataMap[channel] : null
  const { data: camEgoPose } = useSensorDataEgoPose(camBrief?.token ?? null)

  const renderContent = () => {
    // ── EGO_POSE ───────────────────────────────────────────────────────────
    if (channel === 'EGO_POSE') {
      if (!location) return <Placeholder text="No Map" />
      const currentIndex = sampleToken
        ? egoPoses.findIndex((p) => p.sample_token === sampleToken)
        : -1
      const centerPoint: [number, number] | null = egoPoses.length > 0
        ? (() => {
            const mid = egoPoses[Math.floor(egoPoses.length / 2)]
            return [mid.translation[0], mid.translation[1]] as [number, number]
          })()
        : null
      return (
        <MapCanvas
          location={location}
          egoPoses={egoPoses}
          currentIndex={currentIndex}
          showStartEnd={false}
          centerPoint={centerPoint}
          className="w-full h-full"
        />
      )
    }

    // ── LIDAR / RADAR ──────────────────────────────────────────────────────
    if (channel === 'LIDAR_TOP' || channel.startsWith('RADAR_')) {
      const brief = sampleDataMap[channel]
      if (!brief) return <Placeholder text={`No ${channel}`} />

      const calibSensor = brief.calibrated_sensor_token
        ? calibSensorMap[brief.calibrated_sensor_token]
        : undefined
      const lidarCalibArray = calibSensor ? {
        translation: calibSensor.translation,
        rotation:    calibSensor.rotation,
      } : undefined

      const isRadar = channel.startsWith('RADAR_')

      // RADAR の場合は LIDAR_TOP 座標系に変換するための token を取得
      const lidarBrief      = isRadar ? sampleDataMap['LIDAR_TOP'] : null
      const lidarCalibToken = lidarBrief?.calibrated_sensor_token ?? null

      // RADAR BEV の BBox 投影には LIDAR_TOP のキャリブを使う
      const lidarTopCalib = lidarCalibToken ? calibSensorMap[lidarCalibToken] : undefined
      const lidarTopCalibArray = lidarTopCalib ? {
        translation: lidarTopCalib.translation,
        rotation:    lidarTopCalib.rotation,
      } : undefined

      return (
        <PointCloudCanvas
          sampleDataToken={brief.token}
          annotations={annotations}
          egoPose={currentEgoPose}
          lidarCalibSensor={isRadar ? lidarTopCalibArray : lidarCalibArray}
          refSensorToken={isRadar ? lidarCalibToken : null}
          location={location}
          pointSize={isRadar ? 4 : 2}
          onBBoxClick={onBBoxClick}
          className="w-full h-full"
        />
      )
    }

    // ── カメラ ──────────────────────────────────────────────────────────────
    if (channel.startsWith('CAM_')) {
      const brief = sampleDataMap[channel]
      console.log('[Camera] channel:', channel)
      console.log('[Camera] camBrief?.token:', brief?.token)
      console.log('[Camera] camEgoPose:', camEgoPose?.translation)
      console.log('[Camera] using egoPose:', (camEgoPose ?? currentEgoPose)?.translation)
      if (!brief) return <Placeholder text={`No ${channel}`} />

      const calibSensor = brief.calibrated_sensor_token
        ? calibSensorMap[brief.calibrated_sensor_token]
        : undefined
      if (!calibSensor) return <Placeholder text="No calib" />

      return (
        <CameraImageCanvas
          sampleDataToken={brief.token}
          calibratedSensor={calibSensor}
          egoPose={camEgoPose ?? currentEgoPose}
          annotations={annotations}
          highlightToken={highlightAnnToken}
          onBBoxClick={onBBoxClick}
          className="w-full h-full"
        />
      )
    }

    return <Placeholder text={channel} />
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-gray-900">
      {/* チャンネル名ラベル */}
      <div
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
          background: 'rgba(0,0,0,0.55)', padding: '1px 4px',
          fontSize: 9, color: '#aaa', pointerEvents: 'none',
        }}
      >
        {channel}
      </div>
      {renderContent()}
    </div>
  )
}

function Placeholder({ text }: { text: string }) {
  return (
    <div className="w-full h-full flex items-center justify-center bg-gray-900 text-gray-600 text-xs">
      {text}
    </div>
  )
}
