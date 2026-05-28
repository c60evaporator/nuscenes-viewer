import { useMemo, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import LeftPane from '@/components/layout/LeftPane'
import RightPane from '@/components/layout/RightPane'
import { Button } from '@/components/ui/button'
import SampleFilter from '@/components/sample/SampleFilter'
import SampleList from '@/components/sample/SampleList'
import SampleSlider from '@/components/sample/SampleSlider'
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
  const setInstance        = useViewerStore((s) => s.setInstance)
  const lock               = useNavigationStore((s) => s.lock)
  const lockedSceneToken   = useNavigationStore((s) => s.lockedSceneToken)

  const [selectedSceneToken, setSelectedSceneToken] = useState<string | null>(
    lockedSceneToken ?? null,
  )
  const [highlightInstanceToken, setHighlightInstanceToken] = useState<string | null>(null)
  const [currentSampleIndex, setCurrentSampleIndex] = useState(0)

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

  // location 変更時にリセット（派生 state）
  const [prevMapLocation, setPrevMapLocation] = useState(currentMapLocation)
  if (prevMapLocation !== currentMapLocation) {
    setPrevMapLocation(currentMapLocation)
    if (!lockedSceneToken) {
      setSelectedSceneToken(null)
      setSample(null)
    }
  }

  // 初期 Scene の設定（派生 state）
  const sceneInitKey = `${lockedSceneToken ?? ''}-${locationScenes.map((s) => s.token).join(',')}`
  const [prevSceneInit, setPrevSceneInit] = useState('')
  if (prevSceneInit !== sceneInitKey) {
    setPrevSceneInit(sceneInitKey)
    if (lockedSceneToken) {
      setSelectedSceneToken(lockedSceneToken)
    } else {
      const isValidScene = locationScenes.some((s) => s.token === selectedSceneToken)
      if (!isValidScene && locationScenes.length > 0) {
        setSelectedSceneToken(locationScenes[0].token)
      }
    }
  }

  // サンプルリスト（timestamp 昇順）
  const { data: samplesRaw } = useSamples(selectedSceneToken)
  const samples = useMemo(
    () => [...(samplesRaw ?? [])].sort((a, b) => a.timestamp - b.timestamp),
    [samplesRaw],
  )

  // リスト選択 → スライダー連動（派生 state）
  const sliderSyncKey = `${currentSampleToken ?? ''}-${samples.map((s) => s.token).join(',')}`
  const [prevSliderSyncKey, setPrevSliderSyncKey] = useState(sliderSyncKey)
  if (prevSliderSyncKey !== sliderSyncKey && samples.length > 0) {
    setPrevSliderSyncKey(sliderSyncKey)
    const idx = samples.findIndex((s) => s.token === currentSampleToken)
    setCurrentSampleIndex(idx >= 0 ? idx : 0)
  }

  // スライダー → リスト選択連動
  const handleSliderChange = (index: number) => {
    setCurrentSampleIndex(index)
    if (samples[index]) setSample(samples[index].token)
  }

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

  // 選択中 Sample の Ego Pose
  const currentEgoPose = useMemo(
    () => (egoPoses ?? []).find((p) => p.sample_token === currentSampleToken) ?? null,
    [egoPoses, currentSampleToken],
  )

  // Annotations ボタン
  const annotationsButton = (
    <Button
      className="w-full text-white text-xs"
      style={{ backgroundColor: '#4A90D9' }}
      disabled={!currentSampleToken}
      onClick={() => {
        if (!currentSampleToken) return
        setInstance(highlightInstanceToken)
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
          footer={
            <SampleSlider
              samples={samples}
              selectedIndex={currentSampleIndex}
              onIndexChange={handleSliderChange}
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
            egoPose={currentEgoPose}
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
