import { useEffect, useMemo, useRef, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import LeftPane from '@/components/layout/LeftPane'
import RightPane from '@/components/layout/RightPane'
import AnnotationFilter from '@/components/annotation/AnnotationFilter'
import SampleList from '@/components/sample/SampleList'
import InstanceList from '@/components/instance/InstanceList'
import AnnotationViewer from '@/components/annotation/AnnotationViewer'
import AnnotationEditPanel from '@/components/annotation/AnnotationEditPanel'
import { useScenes, useSceneEgoPoses } from '@/api/scenes'
import { useLogsByLocation } from '@/api/logs'
import { useSamples, useSampleInstances, useSampleAnnotations } from '@/api/samples'
import { useInstanceAnnotations } from '@/api/instances'
import { useCalibratedSensors } from '@/api/sensors'
import { useViewerStore } from '@/store/viewerStore'
import { useNavigationStore } from '@/store/navigationStore'
import type { CalibratedSensor } from '@/types/sensor'
import type { Annotation, Instance } from '@/types/annotation'
import type { TabId } from '@/components/layout/Header'

type EditMode = 'view' | 'edit' | 'add'

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

  // 編集モード state
  const [editMode,         setEditMode]         = useState<EditMode>('view')
  const [workingAnnotation, setWorkingAnnotation] = useState<Annotation | null>(null)

  // ロック判定
  const sceneTokenLocked    = !!lockedSceneToken
  const sampleTokenLocked   = (lockSource === 'sample' && !!lockedSampleToken) || lockSource === 'instance'
  const instanceTokenLocked = lockSource !== 'instance' || !!lockedInstanceToken

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
  const effectiveSampleToken = lockSource === 'instance' ? null : (lockedSampleToken ?? selectedSampleToken)

  // Instance サマリ（Sample に紐づく）
  const { data: instanceSummaries } = useSampleInstances(effectiveSampleToken)

  // Instance アノテーション（Instance フィルタが有効な場合に取得）
  const effectiveInstanceToken = lockSource === 'instance' ? (lockedInstanceToken ?? selectedInstanceToken) : null
  const { data: instanceAnnotationsRaw } = useInstanceAnnotations(effectiveInstanceToken)

  // Sample アノテーション（Sample フィルタが有効な場合に取得、右ペイン表示用）
  const { data: sampleAnnotations } = useSampleAnnotations(effectiveSampleToken)

  // 表示モード
  const hasSampleFilter   = !!effectiveSampleToken
  const hasInstanceFilter = !!effectiveInstanceToken
  const displayMode = hasSampleFilter ? 'instanceList'
    : hasInstanceFilter ? 'sampleList'
    : 'empty'

  // 選択中アノテーション（右ペイン表示用）
  const selectedAnnotation = useMemo(() => {
    if (hasSampleFilter && listSelectedInstanceToken) {
      return (sampleAnnotations ?? []).find(
        (a) => a.instance_token === listSelectedInstanceToken
      ) ?? null
    }
    if (hasInstanceFilter && listSelectedSampleToken) {
      return (instanceAnnotationsRaw ?? []).find(
        (a) => a.sample_token === listSelectedSampleToken
      ) ?? null
    }
    return null
  }, [
    hasSampleFilter, hasInstanceFilter,
    listSelectedInstanceToken, listSelectedSampleToken,
    sampleAnnotations, instanceAnnotationsRaw,
  ])

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
    setEditMode('view')
    setWorkingAnnotation(null)
  }, [effectiveSampleToken])

  // Instance フィルタ変更時にも編集モードをリセット
  useEffect(() => {
    setEditMode('view')
    setWorkingAnnotation(null)
  }, [effectiveInstanceToken])

  // Viewer に渡す sampleToken / instanceToken
  const viewSampleToken   = hasSampleFilter ? effectiveSampleToken   : listSelectedSampleToken
  const viewInstanceToken = hasInstanceFilter ? effectiveInstanceToken : listSelectedInstanceToken

  // BBox クリックハンドラ（Instance フィルタ有効時は無視）
  const handleBBoxClick = (instToken: string) => {
    if (hasInstanceFilter) return
    if (instToken !== listSelectedInstanceToken) {
      setEditMode('view')
      setWorkingAnnotation(null)
    }
    setListSelectedInstanceToken(instToken)
  }

  // ボタン有効/無効ルール
  // bboxSelected: サンプルモード = BBox クリック済み、インスタンスモード = サンプル選択済み
  const bboxSelected = hasSampleFilter
    ? listSelectedInstanceToken !== null
    : hasInstanceFilter
      ? listSelectedSampleToken !== null
      : false
  const isEditing   = editMode !== 'view'
  const canAddBBox  = hasSampleFilter && !hasInstanceFilter && !isEditing
  const canEditBBox = bboxSelected && !isEditing

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
            <div style={{ pointerEvents: isEditing ? 'none' : undefined, opacity: isEditing ? 0.45 : undefined }}>
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
            </div>
          }
          footer={
            <div className="flex gap-2 px-3 py-2">
              <button
                disabled={!canEditBBox}
                className="flex-1 py-1.5 text-xs font-medium rounded text-white"
                style={{
                  background: canEditBBox ? '#4A90D9' : '#374151',
                  cursor:     canEditBBox ? 'pointer' : 'not-allowed',
                  opacity:    canEditBBox ? 1 : 0.5,
                }}
                onClick={() => { setEditMode('edit') }}
              >
                Edit BBox
              </button>
              <button
                disabled={!canAddBBox}
                className="flex-1 py-1.5 text-xs font-medium rounded text-white"
                style={{
                  background: canAddBBox ? '#4A90D9' : '#374151',
                  cursor:     canAddBBox ? 'pointer' : 'not-allowed',
                  opacity:    canAddBBox ? 1 : 0.5,
                }}
                onClick={() => {
                  const egoPose = egoPoses?.find((p) => p.sample_token === effectiveSampleToken)
                  const translation = egoPose
                    ? [...egoPose.translation]
                    : [0, 0, 0]
                  const newAnn: Annotation = {
                    token:            '__working__',
                    instance_token:   '__working__',
                    sample_token:     effectiveSampleToken ?? '',
                    translation,
                    rotation:         [1, 0, 0, 0],
                    size:             [1.8, 4.6, 1.5],
                    prev:             null,
                    next:             null,
                    num_lidar_pts:    0,
                    num_radar_pts:    0,
                    visibility_token: null,
                    category_token:   '',
                    attributes:       [],
                    visibility:       null,
                  }
                  setWorkingAnnotation(newAnn)
                  setEditMode('add')
                  setListSelectedInstanceToken(null)
                  setListSelectedSampleToken(null)
                }}
              >
                Add BBox
              </button>
            </div>
          }
        >
          <div style={{ pointerEvents: isEditing ? 'none' : undefined, opacity: isEditing ? 0.45 : undefined, height: '100%' }}>
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
          </div>
        </LeftPane>
      }
      right={
        <RightPane>
          <AnnotationEditPanel
            annotation={selectedAnnotation}
            sceneToken={selectedSceneToken}
            editMode={editMode}
            onCancel={() => {
              setEditMode('view')
              setWorkingAnnotation(null)
            }}
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
        onBBoxClick={isEditing ? undefined : handleBBoxClick}
        editingInstanceToken={
          editMode === 'edit' ? (viewInstanceToken ?? undefined)
          : editMode === 'add' ? '__working__'
          : undefined
        }
        workingAnnotation={editMode === 'add' ? workingAnnotation : null}
      />
    </MainLayout>
  )
}
