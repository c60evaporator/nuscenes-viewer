import MapCanvas from '@/components/common/MapCanvas'
import PointCloudCanvas from '@/components/common/PointCloudCanvas'
import CameraImageCanvas from '@/components/common/CameraImageCanvas'
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
  // 現在サンプルの ego pose
  const currentEgoPose = sampleToken
    ? egoPoses.find((p) => p.sample_token === sampleToken) ?? egoPoses[0]
    : undefined

  const renderContent = () => {
    // ── EGO_POSE ───────────────────────────────────────────────────────────
    if (channel === 'EGO_POSE') {
      if (!location) return <Placeholder text="No Map" />
      const currentIndex = sampleToken
        ? egoPoses.findIndex((p) => p.sample_token === sampleToken)
        : -1
      const centerPoint: [number, number] | null = egoPoses.length > 0
        ? [egoPoses[0].translation[0], egoPoses[0].translation[1]]
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
        translation: [calibSensor.translation.x, calibSensor.translation.y, calibSensor.translation.z],
        rotation:    [calibSensor.rotation.w, calibSensor.rotation.x, calibSensor.rotation.y, calibSensor.rotation.z],
      } : undefined

      const isRadar = channel.startsWith('RADAR_')
      return (
        <PointCloudCanvas
          sampleDataToken={brief.token}
          annotations={isRadar ? [] : annotations}
          egoPose={currentEgoPose}
          lidarCalibSensor={lidarCalibArray}
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
      if (!brief) return <Placeholder text={`No ${channel}`} />

      const calibSensor = brief.calibrated_sensor_token
        ? calibSensorMap[brief.calibrated_sensor_token]
        : undefined
      if (!calibSensor) return <Placeholder text="No calib" />

      return (
        <CameraImageCanvas
          sampleDataToken={brief.token}
          calibratedSensor={calibSensor}
          egoPose={currentEgoPose}
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
