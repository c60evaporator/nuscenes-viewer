import { useEffect, useMemo, useRef, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import LeftPane from '@/components/layout/LeftPane'
import RightPane from '@/components/layout/RightPane'
import AnnotationFilter from '@/components/annotation/AnnotationFilter'
import SampleList from '@/components/sample/SampleList'
import InstanceList from '@/components/instance/InstanceList'
import AnnotationViewer from '@/components/annotation/AnnotationViewer'
import AnnotationInfo from '@/components/annotation/AnnotationInfo'
import { useScenes, useSceneEgoPoses } from '@/api/scenes'
import { useLogsByLocation } from '@/api/logs'
import { useSamples, useSampleInstances } from '@/api/samples'
import { useInstanceAnnotations } from '@/api/instances'
import { useCalibratedSensors } from '@/api/sensors'
import { useViewerStore } from '@/store/viewerStore'
import { useNavigationStore } from '@/store/navigationStore'
import type { CalibratedSensor } from '@/types/sensor'
import type { Instance } from '@/types/annotation'
import type { TabId } from '@/components/layout/Header'

interface AnnotationPageProps {
  activeTab:   TabId
  onTabChange: (tab: TabId) => void
}

export default function AnnotationPage({ activeTab, onTabChange }: AnnotationPageProps) {
  const currentMapLocation      = useViewerStore((s) => s.currentMapLocation)
  const lockedSceneToken        = useNavigationStore((s) => s.lockedSceneToken)
  const lockedSampleToken       = useNavigationStore((s) => s.lockedSampleToken)
  const lockedInstanceToken     = useNavigationStore((s) => s.lockedInstanceToken)
  const lockSource              = useNavigationStore((s) => s.lockSource)

  // フィルタ state
  const [selectedSceneToken,    setSelectedSceneToken]    = useState<string | null>(lockedSceneToken ?? null)
  const [selectedSampleToken,   setSelectedSampleToken]   = useState<string | null>(lockedSampleToken ?? null)
  const [selectedInstanceToken, setSelectedInstanceToken] = useState<string | null>(lockedInstanceToken ?? null)

  // リスト選択 state（左ペインのリストで選択した値）
  const [listSelectedSampleToken,   setListSelectedSampleToken]   = useState<string | null>(null)
  const [listSelectedInstanceToken, setListSelectedInstanceToken] = useState<string | null>(null)

  // ロック判定
  const sceneTokenLocked    = !!lockedSceneToken
  const sampleTokenLocked   = lockSource === 'sample'   && !!lockedSampleToken
  const instanceTokenLocked = lockSource === 'instance' && !!lockedInstanceToken

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

  // location 変更時にリセット
  useEffect(() => {
    if (!lockedSceneToken) {
      setSelectedSceneToken(null)
      setSelectedSampleToken(null)
      setSelectedInstanceToken(null)
      setListSelectedSampleToken(null)
      setListSelectedInstanceToken(null)
    }
  }, [currentMapLocation])

  // 初期 Scene の設定
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

  // Sample リスト（Scene に紐づく）
  const { data: samplesRaw } = useSamples(selectedSceneToken)
  const samples = useMemo(
    () => [...(samplesRaw ?? [])].sort((a, b) => a.timestamp - b.timestamp),
    [samplesRaw],
  )

  // Scene 変更時に selectedSampleToken をリセット（ロックされていない場合のみ）
  const prevSceneRef = useRef<string | null>(null)
  useEffect(() => {
    if (prevSceneRef.current !== null && prevSceneRef.current !== selectedSceneToken && !sampleTokenLocked) {
      setSelectedSampleToken(null)
      setListSelectedSampleToken(null)
      setListSelectedInstanceToken(null)
    }
    prevSceneRef.current = selectedSceneToken
  }, [selectedSceneToken, sampleTokenLocked])

  // 有効なサンプルトークン（フィルタ）
  const effectiveSampleToken = lockedSampleToken ?? selectedSampleToken

  // Instance サマリ（Sample に紐づく）
  const { data: instanceSummaries } = useSampleInstances(effectiveSampleToken)

  // Instance アノテーション（Instance フィルタが有効な場合に取得）
  const effectiveInstanceToken = lockedInstanceToken ?? selectedInstanceToken
  const { data: instanceAnnotationsRaw } = useInstanceAnnotations(effectiveInstanceToken)

  // 表示モード
  const hasSampleFilter   = !!effectiveSampleToken
  const hasInstanceFilter = !!effectiveInstanceToken
  const displayMode = hasSampleFilter ? 'instanceList'
    : hasInstanceFilter ? 'sampleList'
    : 'empty'

  // Case 2: Instance フィルタ → Instance を含む Sample リスト
  const instanceSampleTokenSet = useMemo(
    () => new Set((instanceAnnotationsRaw ?? []).map((a) => a.sample_token)),
    [instanceAnnotationsRaw],
  )
  const samplesForInstance = useMemo(
    () => samples.filter((s) => instanceSampleTokenSet.has(s.token)),
    [samples, instanceSampleTokenSet],
  )

  // Instance フィルタ変更時にリスト選択をリセット
  useEffect(() => {
    setListSelectedSampleToken(null)
    setListSelectedInstanceToken(null)
  }, [effectiveInstanceToken])

  // Sample フィルタ変更時にリスト選択をリセット
  useEffect(() => {
    setListSelectedInstanceToken(null)
  }, [effectiveSampleToken])

  // Viewer に渡す sampleToken / instanceToken
  const viewSampleToken   = hasSampleFilter ? effectiveSampleToken   : listSelectedSampleToken
  const viewInstanceToken = hasInstanceFilter ? effectiveInstanceToken : listSelectedInstanceToken

  // BBox クリックハンドラ（Instance フィルタ有効時は無視）
  const handleBBoxClick = (instToken: string) => {
    if (hasInstanceFilter) return
    setListSelectedInstanceToken(instToken)
  }

  // Calibrated Sensors
  const { data: calibSensorsData } = useCalibratedSensors()
  const calibSensorMap = useMemo<Record<string, CalibratedSensor>>(() => {
    const map: Record<string, CalibratedSensor> = {}
    calibSensorsData?.items.forEach((cs) => { map[cs.channel] = cs })
    return map
  }, [calibSensorsData])

  // Ego Poses
  const { data: egoPoses } = useSceneEgoPoses(selectedSceneToken)

  // Case 3 用: InstanceSummary → Instance 型マッピング
  const instanceListItems = useMemo<Instance[]>(
    () => (instanceSummaries ?? []).map((is) => ({
      token:                  is.instance_token,
      category_token:         '',
      category_name:          is.category_name,
      nbr_annotations:        is.nbr_annotations,
      first_annotation_token: null,
      last_annotation_token:  null,
    })),
    [instanceSummaries],
  )

  return (
    <MainLayout
      activeTab={activeTab}
      onTabChange={onTabChange}
      left={
        <LeftPane
          filter={
            <AnnotationFilter
              scenes={locationScenes}
              selectedSceneToken={selectedSceneToken}
              onSceneChange={setSelectedSceneToken}
              sceneTokenLocked={sceneTokenLocked}
              samples={samples}
              selectedSampleToken={effectiveSampleToken}
              onSampleChange={setSelectedSampleToken}
              sampleTokenLocked={sampleTokenLocked}
              instanceSummaries={instanceSummaries ?? []}
              selectedInstanceToken={effectiveInstanceToken}
              onInstanceChange={setSelectedInstanceToken}
              instanceTokenLocked={instanceTokenLocked}
            />
          }
          footer={
            <div className="flex gap-2 px-3 py-2">
              <button
                className="flex-1 py-1.5 text-xs font-medium rounded text-white"
                style={{ background: '#4A90D9' }}
                onClick={() => {/* TODO: Edit BBox */}}
              >
                Edit BBox
              </button>
              <button
                className="flex-1 py-1.5 text-xs font-medium rounded text-white"
                style={{ background: '#4A90D9' }}
                onClick={() => {/* TODO: Add BBox */}}
              >
                Add BBox
              </button>
            </div>
          }
        >
          {displayMode === 'empty' && (
            <div className="p-4 text-center text-gray-400 text-xs">
              Please select Sample or Instance
            </div>
          )}
          {displayMode === 'sampleList' && (
            <SampleList
              samples={samplesForInstance}
              currentSampleToken={listSelectedSampleToken}
              onSelect={setListSelectedSampleToken}
            />
          )}
          {displayMode === 'instanceList' && (
            <InstanceList
              instances={instanceListItems}
              currentInstanceToken={listSelectedInstanceToken}
              onSelect={setListSelectedInstanceToken}
              highlightInstanceToken={listSelectedInstanceToken}
            />
          )}
        </LeftPane>
      }
      right={
        <RightPane>
          <AnnotationInfo
            annotation={null}
            categoryMap={{}}
          />
        </RightPane>
      }
    >
      <AnnotationViewer
        sampleToken={viewSampleToken}
        instanceToken={viewInstanceToken}
        location={currentMapLocation}
        calibSensorMap={calibSensorMap}
        sceneEgoPoses={egoPoses ?? []}
        onBBoxClick={handleBBoxClick}
      />
    </MainLayout>
  )
}
