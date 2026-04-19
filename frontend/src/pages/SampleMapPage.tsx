import { useEffect, useMemo, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import LeftPane from '@/components/layout/LeftPane'
import RightPane from '@/components/layout/RightPane'
import SampleFilter from '@/components/sample/SampleFilter'
import SampleList from '@/components/sample/SampleList'
import SensorSelector from '@/components/sample-map/SensorSelector'
import LayerCheckboxes from '@/components/map/LayerCheckboxes'
import SampleMapViewer from '@/components/sample-map/SampleMapViewer'
import MapAnnotationInfo from '@/components/map/MapAnnotationInfo'
import { useScenes, useSceneEgoPoses } from '@/api/scenes'
import { useLogsByLocation } from '@/api/logs'
import { useSamples, useSampleSensorData } from '@/api/samples'
import { useCalibratedSensors } from '@/api/sensors'
import { useMapByLocation } from '@/api/maps'
import { useViewerStore } from '@/store/viewerStore'
import { useNavigationStore } from '@/store/navigationStore'
import type { CalibratedSensor } from '@/types/sensor'
import type { GeoJSONMapFeature, MapLayer } from '@/types/map'
import type { TabId } from '@/components/layout/Header'

interface SampleMapPageProps {
  activeTab:   TabId
  onTabChange: (tab: TabId) => void
}

const DEFAULT_CHANNEL = 'CAM_FRONT'

export default function SampleMapPage({ activeTab, onTabChange }: SampleMapPageProps) {
  const currentMapLocation = useViewerStore((s) => s.currentMapLocation)
  const currentSampleToken = useViewerStore((s) => s.currentSampleToken)
  const setSample          = useViewerStore((s) => s.setSample)
  const lockedSceneToken   = useNavigationStore((s) => s.lockedSceneToken)

  const [selectedSceneToken, setSelectedSceneToken] = useState<string | null>(lockedSceneToken ?? null)
  const [selectedChannel,    setSelectedChannel]    = useState<string>(DEFAULT_CHANNEL)
  const [selectedFeature,    setSelectedFeature]    = useState<GeoJSONMapFeature | null>(null)
  const [selectedLayer,      setSelectedLayer]      = useState<MapLayer | null>(null)

  // ロケーション内のシーンリスト
  const { data: logsData   } = useLogsByLocation(currentMapLocation)
  const { data: scenesData } = useScenes({ limit: 500 })

  const locationLogTokens = useMemo(
    () => new Set((logsData ?? []).map((l) => l.token)),
    [logsData],
  )

  const locationScenes = useMemo(() => {
    return (scenesData?.items ?? [])
      .filter((s) => locationLogTokens.has(s.log_token))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [scenesData, locationLogTokens])

  // 初期 Scene の設定
  useEffect(() => {
    if (lockedSceneToken) {
      setSelectedSceneToken(lockedSceneToken)
    } else if (!selectedSceneToken && locationScenes.length > 0) {
      setSelectedSceneToken(locationScenes[0].token)
    }
  }, [lockedSceneToken, locationScenes, selectedSceneToken])

  // サンプルリスト
  const { data: samplesRaw } = useSamples(selectedSceneToken)
  const samples = useMemo(
    () => [...(samplesRaw ?? [])].sort((a, b) => a.timestamp - b.timestamp),
    [samplesRaw],
  )

  // センサーデータ
  const { data: sensorDataMap } = useSampleSensorData(currentSampleToken)

  // 選択チャンネルが利用可能かチェック（利用不可なら DEFAULT_CHANNEL に戻す）
  useEffect(() => {
    if (sensorDataMap && !(selectedChannel in sensorDataMap)) {
      const fallback = DEFAULT_CHANNEL in sensorDataMap
        ? DEFAULT_CHANNEL
        : Object.keys(sensorDataMap)[0] ?? DEFAULT_CHANNEL
      setSelectedChannel(fallback)
    }
  }, [sensorDataMap, selectedChannel])

  // Calibrated Sensors
  const { data: calibSensorsData } = useCalibratedSensors()
  const calibSensorMap = useMemo<Record<string, CalibratedSensor>>(() => {
    const map: Record<string, CalibratedSensor> = {}
    calibSensorsData?.items.forEach((cs) => { map[cs.channel] = cs })
    return map
  }, [calibSensorsData])

  // Ego Poses
  const { data: egoPoses } = useSceneEgoPoses(selectedSceneToken)

  // 現在サンプルの ego pose
  const currentEgoPose = currentSampleToken
    ? (egoPoses ?? []).find((p) => p.sample_token === currentSampleToken)
    : undefined

  // Map メタ
  const { data: mapMeta } = useMapByLocation(currentMapLocation)

  const handleFeatureClick = (feature: GeoJSONMapFeature, layer: MapLayer) => {
    setSelectedFeature(feature)
    setSelectedLayer(layer)
  }

  return (
    <MainLayout
      activeTab={activeTab}
      onTabChange={onTabChange}
      left={
        <LeftPane
          filter={
            <div className="space-y-3">
              <SampleFilter
                scenes={locationScenes}
                selectedSceneToken={selectedSceneToken}
                onFilterChange={setSelectedSceneToken}
                locked={!!lockedSceneToken}
              />
              <SensorSelector
                sampleDataMap={sensorDataMap ?? {}}
                selectedChannel={selectedChannel}
                onChannelChange={setSelectedChannel}
              />
            </div>
          }
        >
          <div className="flex flex-col h-full">
            <SampleList
              samples={samples}
              currentSampleToken={currentSampleToken}
              onSelect={setSample}
            />
            <div className="border-t border-gray-200">
              <LayerCheckboxes />
            </div>
          </div>
        </LeftPane>
      }
      right={
        <RightPane>
          <MapAnnotationInfo feature={selectedFeature} layer={selectedLayer} />
        </RightPane>
      }
    >
      <SampleMapViewer
        selectedChannel={selectedChannel}
        sampleDataMap={sensorDataMap ?? {}}
        calibSensorMap={calibSensorMap}
        egoPose={currentEgoPose}
        mapToken={mapMeta?.token ?? null}
        location={currentMapLocation}
        onFeatureClick={handleFeatureClick}
      />
    </MainLayout>
  )
}
