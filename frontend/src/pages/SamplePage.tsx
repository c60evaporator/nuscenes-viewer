import { useEffect, useMemo, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import LeftPane from '@/components/layout/LeftPane'
import RightPane from '@/components/layout/RightPane'
import { Button } from '@/components/ui/button'
import SampleFilter from '@/components/sample/SampleFilter'
import SampleList from '@/components/sample/SampleList'
import SampleInfo from '@/components/sample/SampleInfo'
import SensorGrid from '@/components/sample/SensorGrid'
import { useScenes } from '@/api/scenes'
import { useSceneEgoPoses } from '@/api/scenes'
import { useLogsByLocation } from '@/api/logs'
import { useSamples, useSampleAnnotations, useSampleSensorData, useSampleInstances } from '@/api/samples'
import { useCalibratedSensors } from '@/api/sensors'
import { useViewerStore } from '@/store/viewerStore'
import { useNavigationStore } from '@/store/navigationStore'
import type { CalibratedSensor } from '@/types/sensor'
import type { TabId } from '@/components/layout/Header'

interface SamplePageProps {
  activeTab:   TabId
  onTabChange: (tab: TabId) => void
}

export default function SamplePage({ activeTab, onTabChange }: SamplePageProps) {
  const currentMapLocation = useViewerStore((s) => s.currentMapLocation)
  const currentSampleToken = useViewerStore((s) => s.currentSampleToken)
  const setSample          = useViewerStore((s) => s.setSample)
  const lock               = useNavigationStore((s) => s.lock)
  const lockedSceneToken   = useNavigationStore((s) => s.lockedSceneToken)

  const [selectedSceneToken, setSelectedSceneToken] = useState<string | null>(
    lockedSceneToken ?? null,
  )
  const [highlightInstanceToken, setHighlightInstanceToken] = useState<string | null>(null)

  const handleBBoxClick = (annToken: string) => {
    const ann = (annotations ?? []).find((a) => a.token === annToken)
    setHighlightInstanceToken(ann?.instance_token ?? null)
  }

  // ロケーション内のシーンリスト（フィルタ選択肢）
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

  // location 変更時にリセット
  useEffect(() => {
    if (!lockedSceneToken) {
      setSelectedSceneToken(null)
      setSample(null)
    }
  }, [currentMapLocation])

  // 初期 Scene の設定（lockedSceneToken → 最初の Scene）
  useEffect(() => {
    if (lockedSceneToken) {
      setSelectedSceneToken(lockedSceneToken)
      return
    }
    const isValidScene = locationScenes.some((s) => s.token === selectedSceneToken)
    if (!isValidScene && locationScenes.length > 0) {
      setSelectedSceneToken(locationScenes[0].token)
    }
  }, [lockedSceneToken, locationScenes])

  // サンプルリスト（timestamp 昇順）
  const { data: samplesRaw } = useSamples(selectedSceneToken)
  const samples = useMemo(
    () => [...(samplesRaw ?? [])].sort((a, b) => a.timestamp - b.timestamp),
    [samplesRaw],
  )

  // 選択サンプルのデータ
  const { data: sensorDataMap } = useSampleSensorData(currentSampleToken)
  const { data: annotations   } = useSampleAnnotations(currentSampleToken)
  const { data: instances     } = useSampleInstances(currentSampleToken)
  const { data: egoPoses      } = useSceneEgoPoses(selectedSceneToken)

  // Calibrated Sensors（チャンネル名でインデックス化）
  const { data: calibSensorsData } = useCalibratedSensors()
  const calibSensorMap = useMemo<Record<string, CalibratedSensor>>(() => {
    const map: Record<string, CalibratedSensor> = {}
    calibSensorsData?.items.forEach((cs) => {
      map[cs.token] = cs
    })
    return map
  }, [calibSensorsData])

  // 選択中の Sample オブジェクト
  const selectedSample = useMemo(
    () => samples.find((s) => s.token === currentSampleToken) ?? null,
    [samples, currentSampleToken],
  )

  // Annotations ボタン
  const annotationsButton = (
    <Button
      className="w-full text-white text-xs"
      style={{ backgroundColor: '#4A90D9' }}
      disabled={!currentSampleToken}
      onClick={() => {
        if (!currentSampleToken) return
        // TODO: 将来的には別ウィンドウ対応。現在は同一ウィンドウで遷移
        lock('sample', {
          sceneToken:  selectedSceneToken ?? undefined,
          sampleToken: currentSampleToken,
        })
        onTabChange('annotation')
      }}
    >
      Annotations
    </Button>
  )

  return (
    <MainLayout
      activeTab={activeTab}
      onTabChange={onTabChange}
      left={
        <LeftPane
          filter={
            <SampleFilter
              scenes={locationScenes}
              selectedSceneToken={selectedSceneToken}
              onFilterChange={setSelectedSceneToken}
              locked={!!lockedSceneToken}
            />
          }
        >
          <SampleList
            samples={samples}
            currentSampleToken={currentSampleToken}
            onSelect={setSample}
          />
        </LeftPane>
      }
      right={
        <RightPane actions={annotationsButton}>
          <SampleInfo
            sample={selectedSample}
            instances={instances ?? []}
            sceneToken={selectedSceneToken}
            onTabChange={onTabChange}
            highlightInstanceToken={highlightInstanceToken}
            onInstanceHighlight={setHighlightInstanceToken}
          />
        </RightPane>
      }
    >
      <SensorGrid
        sampleToken={currentSampleToken}
        sampleDataMap={sensorDataMap ?? {}}
        annotations={annotations ?? []}
        egoPoses={egoPoses ?? []}
        calibSensorMap={calibSensorMap}
        location={currentMapLocation}
        onBBoxClick={handleBBoxClick}
        highlightInstanceToken={highlightInstanceToken ?? undefined}
      />
    </MainLayout>
  )
}
