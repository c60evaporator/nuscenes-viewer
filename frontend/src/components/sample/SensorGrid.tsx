import { Group, Panel, Separator } from 'react-resizable-panels'
import SensorCell from './SensorCell'
import type { Annotation } from '@/types/annotation'
import type { CalibratedSensor, EgoPosePoint, SensorDataMap } from '@/types/sensor'

const H_SEP = 'h-1 bg-[#374151] hover:bg-blue-400 cursor-row-resize transition-colors'
const V_SEP = 'w-1 bg-[#374151] hover:bg-blue-400 cursor-col-resize transition-colors'

export type GridConfig = string[][]

export const DEFAULT_GRID_CONFIG: GridConfig = [
  ['EGO_POSE',       'LIDAR_TOP',   'RADAR_FRONT'      ],
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
  onBBoxClick:              (annToken: string) => void
  highlightInstanceToken?:  string
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
  highlightInstanceToken,
}: SensorGridProps) {
  if (!sampleToken) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        Please select a sample
      </div>
    )
  }

  const rowElements = config.flatMap((row, ri) => {
    const rowEl = (
      <Panel key={`row-${ri}`} defaultSize={100 / config.length}>
        <Group orientation="horizontal" className="h-full">
          {row.flatMap((channel, ci) => {
            const cellEl = (
              <Panel key={`cell-${ri}-${ci}`} defaultSize={100 / row.length}>
                <div className="w-full h-full relative overflow-hidden">
                  <SensorCell
                    channel={channel}
                    sampleToken={sampleToken}
                    sampleDataMap={sampleDataMap}
                    annotations={annotations}
                    egoPoses={egoPoses}
                    calibSensorMap={calibSensorMap}
                    location={location}
                    onBBoxClick={onBBoxClick}
                    highlightInstanceToken={highlightInstanceToken}
                  />
                </div>
              </Panel>
            )
            return ci === 0
              ? [cellEl]
              : [<Separator key={`vsep-${ri}-${ci}`} className={V_SEP} />, cellEl]
          })}
        </Group>
      </Panel>
    )
    return ri === 0
      ? [rowEl]
      : [<Separator key={`hsep-${ri}`} className={H_SEP} />, rowEl]
  })

  return (
    <Group orientation="vertical" className="w-full h-full">
      {rowElements}
    </Group>
  )
}
