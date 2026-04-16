import SensorCell from './SensorCell'
import type { Annotation } from '@/types/annotation'
import type { CalibratedSensor, EgoPosePoint, SensorDataMap } from '@/types/sensor'

export type GridConfig = string[][]

export const DEFAULT_GRID_CONFIG: GridConfig = [
  ['EGO_POSE',       'LIDAR_TOP',   'FUSED_RADER'      ],
  ['CAM_FRONT_LEFT', 'CAM_FRONT',   'CAM_FRONT_RIGHT'  ],
  ['CAM_BACK_LEFT',  'CAM_BACK',    'CAM_BACK_RIGHT'   ],
]

interface SensorGridProps {
  config?:           GridConfig
  sampleToken:       string | null
  sampleDataMap:     SensorDataMap
  annotations:       Annotation[]
  egoPoses:          EgoPosePoint[]
  calibSensorMap:    Record<string, CalibratedSensor>
  location:          string | null
  onBBoxClick:       (annToken: string) => void
  highlightAnnToken?: string
}

export default function SensorGrid({
  config = DEFAULT_GRID_CONFIG,
  sampleToken,
  sampleDataMap,
  annotations,
  egoPoses,
  calibSensorMap,
  location,
  onBBoxClick,
  highlightAnnToken,
}: SensorGridProps) {
  if (!sampleToken) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        サンプルを選択してください
      </div>
    )
  }

  return (
    <div className="flex flex-col w-full h-full">
      {config.map((row, rowIdx) => (
        <div key={rowIdx} className="flex flex-1 min-h-0">
          {row.map((channel) => (
            <div
              key={channel}
              className="flex-1 min-w-0 relative"
              style={{ border: '1px solid #374151' }}
            >
              <SensorCell
                channel={channel}
                sampleToken={sampleToken}
                sampleDataMap={sampleDataMap}
                annotations={annotations}
                egoPoses={egoPoses}
                calibSensorMap={calibSensorMap}
                location={location}
                onBBoxClick={onBBoxClick}
                highlightAnnToken={highlightAnnToken}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
