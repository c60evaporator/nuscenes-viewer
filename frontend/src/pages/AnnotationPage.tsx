import { useEffect, useMemo, useRef, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import LeftPane from '@/components/layout/LeftPane'
import RightPane from '@/components/layout/RightPane'
import AnnotationFilter from '@/components/annotation/AnnotationFilter'
import SampleList from '@/components/sample/SampleList'
import InstanceList from '@/components/instance/InstanceList'
import AnnotationViewer from '@/components/annotation/AnnotationViewer'
import AnnotationEditPanel from '@/components/annotation/AnnotationEditPanel'
import { useDeleteAnnotation } from '@/api/annotations'
import { ApiError } from '@/api/client'
import { useCategories } from '@/api/categories'
import { useScenes, useSceneEgoPoses } from '@/api/scenes'
import { useLogsByLocation } from '@/api/logs'
import { useSamples, useSampleInstances, useSampleAnnotations, useSampleSensorData } from '@/api/samples'
import { useInstanceAnnotations } from '@/api/instances'
import { useCalibratedSensors } from '@/api/sensors'
import { resolveDefaultSize } from '@/lib/bboxDefaults'
import { rankCamerasByScore, sortCameraChannels, pickDefaultCameraChannel } from '@/lib/cameraSelection'
import { getSampleEgoPose } from '@/lib/egoPoseUtils'
import { useViewerStore } from '@/store/viewerStore'
import { useNavigationStore } from '@/store/navigationStore'
import { useEditStore } from '@/store/editStore'
import { useEditKeyboardShortcuts } from '@/hooks/useEditKeyboardShortcuts'
import type { CalibratedSensor } from '@/types/sensor'
import type { Annotation, Instance } from '@/types/annotation'
import type { TabId } from '@/components/layout/Header'

interface AnnotationPageProps {
  activeTab:   TabId
  onTabChange: (tab: TabId) => void
}

export default function AnnotationPage({ activeTab, onTabChange }: AnnotationPageProps) {
  const currentMapLocation      = useViewerStore((s) => s.currentMapLocation)
  const currentInstanceToken    = useViewerStore((s) => s.currentInstanceToken)
  const lockedSceneToken        = useNavigationStore((s) => s.lockedSceneToken)
  const lockedSampleToken       = useNavigationStore((s) => s.lockedSampleToken)
  const lockedInstanceToken     = useNavigationStore((s) => s.lockedInstanceToken)
  const lockSource              = useNavigationStore((s) => s.lockSource)

  // editStore
  const editMode          = useEditStore((s) => s.mode)
  const editSession       = useEditStore((s) => s.session)
  const currentAnnotation = useEditStore((s) => s.getCurrentAnnotation())
  const startEditSession  = useEditStore((s) => s.startEditSession)
  const startAddSession   = useEditStore((s) => s.startAddSession)
  const endSession        = useEditStore((s) => s.endSession)

  // フィルタ state
  const [selectedSceneToken,    setSelectedSceneToken]    = useState<string | null>(lockedSceneToken ?? null)
  const [selectedSampleToken,   setSelectedSampleToken]   = useState<string | null>(lockedSampleToken ?? null)
  const [selectedInstanceToken, setSelectedInstanceToken] = useState<string | null>(lockedInstanceToken ?? null)

  // Skip モードの錨（最初に「Add BBox to next/prev」を押したときのアノテーショントークン）
  const [skipAnchor, setSkipAnchor] = useState<{
    direction:   'next' | 'prev'
    anchorToken: string
  } | null>(null)

  // リスト選択 state（左ペインのリストで選択した値）
  const [listSelectedSampleToken,   setListSelectedSampleToken]   = useState<string | null>(null)
  // Sample画面から遷移時はviewerStoreの選択インスタンスを初期値として引き継ぐ
  const [listSelectedInstanceToken, setListSelectedInstanceToken] = useState<string | null>(
    lockSource === 'sample' ? (currentInstanceToken ?? null) : null
  )

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

  // location 変更時にリセット（派生 state）
  const [prevMapLocation, setPrevMapLocation] = useState(currentMapLocation)
  if (prevMapLocation !== currentMapLocation) {
    setPrevMapLocation(currentMapLocation)
    if (!lockedSceneToken) {
      setSelectedSceneToken(null)
      setSelectedSampleToken(null)
      setSelectedInstanceToken(null)
      setListSelectedSampleToken(null)
      setListSelectedInstanceToken(null)
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

  // Add BBox to prev/next 用: フィルタ中instanceのcategory名（先頭annotationから解決、全annotation同一category）
  const { data: categories = [] } = useCategories()
  const targetInstanceCategoryName = useMemo(() => {
    const categoryToken = instanceAnnotationsRaw?.[0]?.category_token
    if (!categoryToken) return null
    return categories.find((c) => c.token === categoryToken)?.name ?? null
  }, [instanceAnnotationsRaw, categories])
  // Sample フィルタ時: 選択インスタンスの先頭・末尾サンプル判定用（Instance フィルタ時は null で無効化）
  const { data: sampleModeInstanceAnns } = useInstanceAnnotations(
    !effectiveInstanceToken ? listSelectedInstanceToken : null
  )

  // add モード + Sample フィルタ時の隣接サンプルインスタンス取得（インスタンス選択肢フィルタリング用）
  const sceneIdxOfCurrentSample = (!!effectiveSampleToken && !effectiveInstanceToken)
    ? samples.findIndex((s) => s.token === effectiveSampleToken)
    : -1
  const prevSampleTokenForSampleAdd = sceneIdxOfCurrentSample > 0
    ? (samples[sceneIdxOfCurrentSample - 1]?.token ?? null) : null
  const nextSampleTokenForSampleAdd = sceneIdxOfCurrentSample >= 0 && sceneIdxOfCurrentSample < samples.length - 1
    ? (samples[sceneIdxOfCurrentSample + 1]?.token ?? null) : null
  const { data: prevSampleInstSummaries } = useSampleInstances(
    editMode === 'add' && !effectiveInstanceToken ? prevSampleTokenForSampleAdd : null
  )
  const { data: nextSampleInstSummaries } = useSampleInstances(
    editMode === 'add' && !effectiveInstanceToken ? nextSampleTokenForSampleAdd : null
  )
  const { data: prevSampleAnnotationsForAdd } = useSampleAnnotations(
    editMode === 'add' && !effectiveInstanceToken ? prevSampleTokenForSampleAdd : null
  )
  const { data: nextSampleAnnotationsForAdd } = useSampleAnnotations(
    editMode === 'add' && !effectiveInstanceToken ? nextSampleTokenForSampleAdd : null
  )

  // Sample アノテーション（Sample フィルタが有効な場合に取得、右ペイン表示用）
  const { data: sampleAnnotations } = useSampleAnnotations(effectiveSampleToken)

  // 表示モード
  const hasSampleFilter   = !!effectiveSampleToken
  const hasInstanceFilter = !!effectiveInstanceToken

  // add モード + Sample フィルタ時: 隣接サンプルに含まれ現サンプルに含まれないインスタンスのみ許可
  const allowedInstanceTokens = useMemo<Set<string> | null>(() => {
    if (editMode !== 'add' || hasInstanceFilter) return null
    const currentSet = new Set((instanceSummaries ?? []).map((is) => is.instance_token))
    const adjTokens = new Set([
      ...((prevSampleInstSummaries ?? []).map((is) => is.instance_token)),
      ...((nextSampleInstSummaries ?? []).map((is) => is.instance_token)),
    ])
    const allowed = new Set<string>()
    for (const t of adjTokens) {
      if (!currentSet.has(t)) allowed.add(t)
    }
    return allowed
  }, [editMode, hasInstanceFilter, instanceSummaries, prevSampleInstSummaries, nextSampleInstSummaries])

  const displayMode = hasSampleFilter ? 'instanceList'
    : hasInstanceFilter ? 'sampleList'
    : 'empty'

  // 選択中アノテーション（右ペイン表示用、react-queryキャッシュから）
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

  // Sample フィルタ変更時にリセット (前回値と比較)
  const prevEffectiveSampleTokenRef = useRef<string | null | undefined>(undefined)
  useEffect(() => {
      if (prevEffectiveSampleTokenRef.current !== undefined &&
          prevEffectiveSampleTokenRef.current !== effectiveSampleToken) {
          setListSelectedInstanceToken(null)
          endSession()
      }
      prevEffectiveSampleTokenRef.current = effectiveSampleToken
  }, [effectiveSampleToken, endSession])

  // Instance フィルタ変更時にリセット (前回値と比較)
  const prevEffectiveInstanceTokenRef = useRef<string | null | undefined>(undefined)
  useEffect(() => {
      if (prevEffectiveInstanceTokenRef.current !== undefined &&
          prevEffectiveInstanceTokenRef.current !== effectiveInstanceToken) {
          setListSelectedSampleToken(null)
          setListSelectedInstanceToken(null)
          endSession()
      }
      prevEffectiveInstanceTokenRef.current = effectiveInstanceToken
  }, [effectiveInstanceToken, endSession])

  // editMode が view に戻ったら skipAnchor をリセット
  if (editMode === 'view' && skipAnchor !== null) {
    setSkipAnchor(null)
  }

  // Viewer に渡す sampleToken / instanceToken
  // add モード + instance フィルタ時は editSession.fixedSampleToken（prev/next）を優先
  const viewSampleToken = (editMode === 'add' && editSession?.fixedSampleToken)
    ? editSession.fixedSampleToken
    : hasSampleFilter ? effectiveSampleToken : listSelectedSampleToken
  const viewInstanceToken = hasInstanceFilter ? effectiveInstanceToken : listSelectedInstanceToken

  // BBox クリックハンドラ（Instance フィルタ有効時は無視）
  const handleBBoxClick = (instToken: string) => {
    if (hasInstanceFilter) return
    if (instToken !== listSelectedInstanceToken) {
      endSession()  // 別BBoxへ切り替え時はセッション終了
    }
    setListSelectedInstanceToken(instToken)
  }

  // ボタン有効/無効ルール
  const bboxSelected = hasSampleFilter
    ? listSelectedInstanceToken !== null
    : hasInstanceFilter
      ? listSelectedSampleToken !== null
      : false
  const isEditing   = editMode !== 'view'
  const canAddBBox  = hasSampleFilter && !hasInstanceFilter && !isEditing
  const canEditBBox = bboxSelected && !isEditing

  // Instance フィルタ時の「Add BBox to prev/next」判定
  const instanceFirstSampleToken = samplesForInstance[0]?.token ?? null
  const instanceLastSampleToken  = samplesForInstance[samplesForInstance.length - 1]?.token ?? null
  const sceneIdxOfFirst = instanceFirstSampleToken !== null
    ? samples.findIndex((s) => s.token === instanceFirstSampleToken)
    : -1
  const sceneIdxOfLast = instanceLastSampleToken !== null
    ? samples.findIndex((s) => s.token === instanceLastSampleToken)
    : -1
  const prevSampleToken = sceneIdxOfFirst > 0 ? (samples[sceneIdxOfFirst - 1]?.token ?? null) : null
  const nextSampleToken = sceneIdxOfLast >= 0 && sceneIdxOfLast < samples.length - 1
    ? (samples[sceneIdxOfLast + 1]?.token ?? null) : null
  const canAddToPrev = hasInstanceFilter && !isEditing
    && listSelectedSampleToken !== null
    && listSelectedSampleToken === instanceFirstSampleToken
    && prevSampleToken !== null
  const canAddToNext = hasInstanceFilter && !isEditing
    && listSelectedSampleToken !== null
    && listSelectedSampleToken === instanceLastSampleToken
    && nextSampleToken !== null
  // Skip ボタン（Instance フィルタ + add モード時）
  const currentFixedIdx = editSession
    ? samples.findIndex((s) => s.token === editSession.fixedSampleToken)
    : -1
  const canSkipToNext =
    editMode === 'add' &&
    hasInstanceFilter &&
    editSession !== null &&
    (
      skipAnchor?.direction === 'next' ||
      (skipAnchor === null && editSession.fixedSampleToken === nextSampleToken)
    ) &&
    currentFixedIdx >= 0 &&
    currentFixedIdx < samples.length - 1
  const canSkipToPrev =
    editMode === 'add' &&
    hasInstanceFilter &&
    editSession !== null &&
    (
      skipAnchor?.direction === 'prev' ||
      (skipAnchor === null && editSession.fixedSampleToken === prevSampleToken)
    ) &&
    currentFixedIdx > 0

  // Sample フィルタ時: 選択インスタンスの先頭・末尾サンプルが現在のサンプルかどうか
  const sampleModeFirstToken = sampleModeInstanceAnns?.[0]?.sample_token ?? null
  const sampleModeLastToken  = sampleModeInstanceAnns?.[sampleModeInstanceAnns.length - 1]?.sample_token ?? null
  const sampleModeIsEndpoint = hasSampleFilter && !hasInstanceFilter
    && listSelectedInstanceToken !== null
    && effectiveSampleToken !== null
    && (effectiveSampleToken === sampleModeFirstToken || effectiveSampleToken === sampleModeLastToken)

  const canDeleteBBox = !isEditing && (
    // Instance フィルタ時（既存ロジック）
    (hasInstanceFilter
      && listSelectedSampleToken !== null
      && (listSelectedSampleToken === instanceFirstSampleToken
          || listSelectedSampleToken === instanceLastSampleToken))
    // Sample フィルタ時（新規）
    || sampleModeIsEndpoint
  )

  // Calibrated Sensors
  const { data: calibSensorsData } = useCalibratedSensors()
  const calibSensorMap = useMemo<Record<string, CalibratedSensor>>(() => {
    const map: Record<string, CalibratedSensor> = {}
    calibSensorsData?.items.forEach((cs) => { map[cs.token] = cs })
    return map
  }, [calibSensorsData])

  // Ego Poses
  const { data: egoPoses } = useSceneEgoPoses(selectedSceneToken)

  // 編集中BBoxに対応するego_pose（AnnotationEditPanel の並進ボタン用）
  const editingSampleToken = editSession?.fixedSampleToken
  const editingEgoPose = editingSampleToken && egoPoses
    ? egoPoses.find((p) => p.sample_token === editingSampleToken) ?? null
    : null

  const deleteAnnotation = useDeleteAnnotation()

  // キーボードショートカット
  useEditKeyboardShortcuts({ egoPose: editingEgoPose })

  // ── Sensor フィルタ ─────────────────────────────────────────────────────
  const [selectedSensorChannel, setSelectedSensorChannel] = useState<string | null>(null)
  const { data: viewSampleDataMap } = useSampleSensorData(viewSampleToken)

  // 表示サンプルで利用可能なカメラチャンネル（camera_intrinsic を持つセンサーのみ、標準順）
  const cameraChannels = useMemo(() => {
    const channels = Object.entries(viewSampleDataMap ?? {})
      .filter(([, brief]) => calibSensorMap[brief.calibrated_sensor_token]?.camera_intrinsic != null)
      .map(([channel]) => channel)
    return sortCameraChannels(channels)
  }, [viewSampleDataMap, calibSensorMap])

  const viewEgoPose = useMemo(
    () => getSampleEgoPose(viewSampleDataMap, egoPoses ?? [], viewSampleToken),
    [viewSampleDataMap, egoPoses, viewSampleToken],
  )

  // Sensor フィルタは Sample が選択されているときのみ有効
  const sensorEnabled = hasSampleFilter || (hasInstanceFilter && listSelectedSampleToken !== null)

  // デフォルト選択（派生 state）: 未選択、またはサンプル切替で現チャンネルが消えた場合
  if (
    cameraChannels.length > 0 &&
    (selectedSensorChannel === null || !cameraChannels.includes(selectedSensorChannel))
  ) {
    setSelectedSensorChannel(pickDefaultCameraChannel(cameraChannels))
  }

  // アノテーション選択変更 → 最良カメラを自動選択（派生 state、rankCamerasByScore を再利用）
  // データ未ロードで計算できなかった場合もロード完了後の再レンダーで適用されるよう、
  // 「適用済み annotation token」を持ち重複適用を防ぐ
  const [appliedBestCameraAnn, setAppliedBestCameraAnn] = useState<string | null>(null)
  const selectedAnnToken = selectedAnnotation?.token ?? null
  if (selectedAnnToken === null) {
    if (appliedBestCameraAnn !== null) setAppliedBestCameraAnn(null)
  } else if (
    appliedBestCameraAnn !== selectedAnnToken &&
    viewEgoPose &&
    cameraChannels.length > 0
  ) {
    const ranked = rankCamerasByScore(
      selectedAnnotation!.translation,
      viewEgoPose,
      Object.values(calibSensorMap),
    )
    const best = ranked.find((cs) => cameraChannels.includes(cs.channel))
    if (best) {
      setSelectedSensorChannel(best.channel)
      setAppliedBestCameraAnn(selectedAnnToken)
    }
  }

  // 編集・追加モード時: BBox の移動（translation 変化）に追従して最良カメラへ自動切替
  // （派生 state。編集中に手動で Sensor を変えても、次に BBox を動かすまでは維持される）
  const editingTranslationKey = isEditing && currentAnnotation
    ? currentAnnotation.translation.join(',')
    : null
  const [appliedEditTranslation, setAppliedEditTranslation] = useState<string | null>(null)
  if (editingTranslationKey === null) {
    if (appliedEditTranslation !== null) setAppliedEditTranslation(null)
  } else if (
    appliedEditTranslation !== editingTranslationKey &&
    viewEgoPose &&
    cameraChannels.length > 0
  ) {
    const ranked = rankCamerasByScore(
      currentAnnotation!.translation,
      viewEgoPose,
      Object.values(calibSensorMap),
    )
    const best = ranked.find((cs) => cameraChannels.includes(cs.channel))
    if (best) {
      setSelectedSensorChannel(best.channel)
      setAppliedEditTranslation(editingTranslationKey)
    }
  }

  // add モード時の prev/next 候補
  const { addModePrev, addModeNext } = useMemo(() => {
    if (editMode !== 'add' || !editSession) return { addModePrev: null, addModeNext: null }

    // Instance フィルタ時 (Add BBox to prev/next)
    if (hasInstanceFilter && editSession.fixedSampleToken) {
      // skip モード中: 錨を使う（fixedSampleToken 比較より先に判定）
      if (skipAnchor?.direction === 'next') {
        return { addModePrev: skipAnchor.anchorToken, addModeNext: null }
      }
      if (skipAnchor?.direction === 'prev') {
        return { addModePrev: null, addModeNext: skipAnchor.anchorToken }
      }

      if (editSession.fixedSampleToken === prevSampleToken) {
        const firstAnn = (instanceAnnotationsRaw ?? [])[0]
        return { addModePrev: null, addModeNext: firstAnn?.token ?? null }
      }
      if (editSession.fixedSampleToken === nextSampleToken) {
        const annList = instanceAnnotationsRaw ?? []
        const lastAnn = annList[annList.length - 1]
        return { addModePrev: lastAnn?.token ?? null, addModeNext: null }
      }
    }

    // Sample フィルタ時: ドロップダウンで選択中の既存instanceが
    // 隣接サンプルに持つannotationをprev/nextとして連結する
    if (!hasInstanceFilter) {
      const selectedInstanceToken = editSession.draft.instance_token
      if (selectedInstanceToken) {
        const prevAnn = (prevSampleAnnotationsForAdd ?? [])
          .find((a) => a.instance_token === selectedInstanceToken)
        const nextAnn = (nextSampleAnnotationsForAdd ?? [])
          .find((a) => a.instance_token === selectedInstanceToken)
        return { addModePrev: prevAnn?.token ?? null, addModeNext: nextAnn?.token ?? null }
      }
    }

    return { addModePrev: null, addModeNext: null }
  }, [
    editMode, editSession, hasInstanceFilter, prevSampleToken, nextSampleToken, instanceAnnotationsRaw,
    prevSampleAnnotationsForAdd, nextSampleAnnotationsForAdd, skipAnchor,
  ])

  // Skip 用: 対象サンプルの ego pose 位置に translation を合わせた template を生成
  const makeSkipTemplate = (targetSampleToken: string): Annotation => {
    const draft = editSession!.draft
    const ep = egoPoses?.find((p) => p.sample_token === targetSampleToken)
    const translation = ep
      ? [ep.translation[0], ep.translation[1], ep.translation[2] + draft.size[2] / 2]
      : draft.translation
    return { ...draft, token: '', sample_token: targetSampleToken, translation }
  }

  const handleSkipToNext = () => {
    if (!editSession || currentFixedIdx < 0 || currentFixedIdx >= samples.length - 1) return
    const newToken = samples[currentFixedIdx + 1].token
    if (skipAnchor === null) {
      const annList = instanceAnnotationsRaw ?? []
      const lastAnn = annList[annList.length - 1]
      setSkipAnchor({ direction: 'next', anchorToken: lastAnn?.token ?? '' })
    }
    startAddSession({
      template:             makeSkipTemplate(newToken),
      fixedSampleToken:     newToken,
      fixedInstanceToken:   editSession.fixedInstanceToken,
      isInstanceSelectable: false,
    })
  }

  const handleSkipToPrev = () => {
    if (!editSession || currentFixedIdx <= 0) return
    const newToken = samples[currentFixedIdx - 1].token
    if (skipAnchor === null) {
      const firstAnn = (instanceAnnotationsRaw ?? [])[0]
      setSkipAnchor({ direction: 'prev', anchorToken: firstAnn?.token ?? '' })
    }
    startAddSession({
      template:             makeSkipTemplate(newToken),
      fixedSampleToken:     newToken,
      fixedInstanceToken:   editSession.fixedInstanceToken,
      isInstanceSelectable: false,
    })
  }

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
                cameraChannels={cameraChannels}
                selectedSensorChannel={selectedSensorChannel}
                onSensorChange={setSelectedSensorChannel}
                sensorDisabled={!sensorEnabled}
              />
            </div>
          }
          footer={
            <div className="flex flex-wrap gap-2 px-3 py-2">
              {/* Edit BBox */}
              <button
                disabled={!canEditBBox}
                className="flex-1 py-1.5 text-xs font-medium rounded text-white"
                style={{
                  background: canEditBBox ? '#4A90D9' : '#374151',
                  cursor:     canEditBBox ? 'pointer' : 'not-allowed',
                  opacity:    canEditBBox ? 1 : 0.5,
                  minWidth:   '80px',
                }}
                onClick={() => {
                  if (selectedAnnotation) {
                    startEditSession(selectedAnnotation)
                  }
                }}
              >
                Edit BBox
              </button>

              {/* Delete BBox */}
              <div className="relative flex-1 group" style={{ minWidth: '80px' }}>
                  <button
                      disabled={!canDeleteBBox || deleteAnnotation.isPending}
                      className="w-full py-1.5 text-xs font-medium rounded text-white"
                      style={{
                          background: (canDeleteBBox && !deleteAnnotation.isPending) ? '#DC2626' : '#374151',
                          cursor:     (canDeleteBBox && !deleteAnnotation.isPending) ? 'pointer' : 'not-allowed',
                          opacity:    (canDeleteBBox && !deleteAnnotation.isPending) ? 1 : 0.5,
                      }}
                      onClick={async () => {
                          if (!selectedAnnotation) return
                          const confirmed = window.confirm('Delete this annotation? This cannot be undone in this session.')
                          if (!confirmed) return
                          try {
                              await deleteAnnotation.mutateAsync({
                                  token:          selectedAnnotation.token,
                                  sample_token:   selectedAnnotation.sample_token,
                                  instance_token: selectedAnnotation.instance_token,
                              })
                              setListSelectedSampleToken(null)
                              if (hasSampleFilter && !hasInstanceFilter) setListSelectedInstanceToken(null)
                          } catch (e) {
                              if (e instanceof ApiError) {
                                  if (e.status === 404) {
                                      setListSelectedSampleToken(null)
                                      if (hasSampleFilter && !hasInstanceFilter) setListSelectedInstanceToken(null)
                                  } else {
                                      alert(`Delete failed: ${e.message}`)
                                  }
                              } else {
                                  alert(`Unexpected error: ${(e as Error).message}`)
                              }
                          }
                      }}
                  >
                      {deleteAnnotation.isPending ? 'Deleting...' : 'Delete BBox'}
                  </button>
                  {!canDeleteBBox && (
                      <div
                          className="
                              pointer-events-none absolute z-50
                              left-1/2 -translate-x-1/2 bottom-full mb-2
                              px-2 py-1.5 rounded
                              text-xs leading-snug text-gray-200
                              bg-gray-800 border border-gray-600
                              opacity-0 group-hover:opacity-100
                              transition-opacity duration-100
                              whitespace-normal text-left
                          "
                          style={{ width: '220px' }}
                      >
                          Only FIRST or LAST annotation<br/> of the instance can be deleted
                      </div>
                  )}
              </div>

              {/* Add BBox（サンプルフィルタ時 or インスタンスフィルタ時で出し分け） */}
              {!hasInstanceFilter && (
                <button
                  disabled={!canAddBBox}
                  className="flex-1 py-1.5 text-xs font-medium rounded text-white"
                  style={{
                    background: canAddBBox ? '#4A90D9' : '#374151',
                    cursor:     canAddBBox ? 'pointer' : 'not-allowed',
                    opacity:    canAddBBox ? 1 : 0.5,
                    minWidth:   '80px',
                  }}
                  onClick={() => {
                    const egoPose = egoPoses?.find((p) => p.sample_token === effectiveSampleToken)
                    const size = [1.8, 4.6, 1.5]
                    const translation = egoPose
                      ? [egoPose.translation[0], egoPose.translation[1], egoPose.translation[2] + size[2] / 2]
                      : [0, 0, size[2] / 2]
                    const template: Annotation = {
                      token:            '',
                      instance_token:   '',
                      sample_token:     effectiveSampleToken ?? '',
                      translation,
                      rotation:         [1, 0, 0, 0],
                      size,
                      prev:             null,
                      next:             null,
                      num_lidar_pts:    0,
                      num_radar_pts:    0,
                      visibility_token: null,
                      category_token:   '',
                      attributes:       [],
                      visibility:       null,
                    }
                    startAddSession({
                      template,
                      fixedSampleToken:     effectiveSampleToken ?? '',
                      fixedInstanceToken:   null,
                      isInstanceSelectable: true,
                    })
                    setListSelectedInstanceToken(null)
                    setListSelectedSampleToken(null)
                  }}
                >
                  Add BBox
                </button>
              )}

              {/* Add BBox to prev（インスタンスフィルタ + 最初のサンプルが選択 + scene内に前のサンプルあり） */}
              {hasInstanceFilter && canAddToPrev && (
                <button
                  className="flex-1 py-1.5 text-xs font-medium rounded text-white"
                  style={{ background: '#4A90D9', cursor: 'pointer', minWidth: '80px' }}
                  onClick={() => {
                    const targetToken = prevSampleToken!
                    const egoPose = egoPoses?.find((p) => p.sample_token === targetToken)
                    const size: [number, number, number] =
                      (targetInstanceCategoryName ? resolveDefaultSize(targetInstanceCategoryName) : null)
                      ?? [1.8, 4.6, 1.5]
                    const translation = egoPose
                      ? [egoPose.translation[0], egoPose.translation[1], egoPose.translation[2] + size[2] / 2]
                      : [0, 0, size[2] / 2]
                    const template: Annotation = {
                      token:            '',
                      instance_token:   effectiveInstanceToken ?? '',
                      sample_token:     targetToken,
                      translation,
                      rotation:         [1, 0, 0, 0],
                      size,
                      prev:             null,
                      next:             null,
                      num_lidar_pts:    0,
                      num_radar_pts:    0,
                      visibility_token: null,
                      category_token:   '',
                      attributes:       [],
                      visibility:       null,
                    }
                    startAddSession({
                      template,
                      fixedSampleToken:     targetToken,
                      fixedInstanceToken:   effectiveInstanceToken ?? null,
                      isInstanceSelectable: false,
                    })
                  }}
                >
                  Add BBox to prev
                </button>
              )}

              {/* Add BBox to next（インスタンスフィルタ + 最後のサンプルが選択 + scene内に後のサンプルあり） */}
              {hasInstanceFilter && canAddToNext && (
                <button
                  className="flex-1 py-1.5 text-xs font-medium rounded text-white"
                  style={{ background: '#4A90D9', cursor: 'pointer', minWidth: '80px' }}
                  onClick={() => {
                    const targetToken = nextSampleToken!
                    const egoPose = egoPoses?.find((p) => p.sample_token === targetToken)
                    const size: [number, number, number] =
                      (targetInstanceCategoryName ? resolveDefaultSize(targetInstanceCategoryName) : null)
                      ?? [1.8, 4.6, 1.5]
                    const translation = egoPose
                      ? [egoPose.translation[0], egoPose.translation[1], egoPose.translation[2] + size[2] / 2]
                      : [0, 0, size[2] / 2]
                    const template: Annotation = {
                      token:            '',
                      instance_token:   effectiveInstanceToken ?? '',
                      sample_token:     targetToken,
                      translation,
                      rotation:         [1, 0, 0, 0],
                      size,
                      prev:             null,
                      next:             null,
                      num_lidar_pts:    0,
                      num_radar_pts:    0,
                      visibility_token: null,
                      category_token:   '',
                      attributes:       [],
                      visibility:       null,
                    }
                    startAddSession({
                      template,
                      fixedSampleToken:     targetToken,
                      fixedInstanceToken:   effectiveInstanceToken ?? null,
                      isInstanceSelectable: false,
                    })
                  }}
                >
                  Add BBox to next
                </button>
              )}

              {/* インスタンスフィルタ時、どちらの条件も非該当の場合は disabled Add BBox を表示 */}
              {hasInstanceFilter && !canAddToPrev && !canAddToNext && (
                <button
                  disabled
                  className="flex-1 py-1.5 text-xs font-medium rounded text-white"
                  style={{ background: '#374151', cursor: 'not-allowed', opacity: 0.5, minWidth: '80px' }}
                >
                  Add BBox
                </button>
              )}

              {/* Skip and Add BBox to next/prev（add モード + instance フィルタ + さらに飛ばせる場合） */}
              {canSkipToNext && (
                <button
                  className="flex-1 py-1.5 text-xs font-medium rounded text-white"
                  style={{ background: '#2D6FA8', cursor: 'pointer', minWidth: '80px' }}
                  onClick={handleSkipToNext}
                >
                  Skip and Add BBox to next
                </button>
              )}
              {canSkipToPrev && (
                <button
                  className="flex-1 py-1.5 text-xs font-medium rounded text-white"
                  style={{ background: '#2D6FA8', cursor: 'pointer', minWidth: '80px' }}
                  onClick={handleSkipToPrev}
                >
                  Skip and Add BBox to prev
                </button>
              )}
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
            allowedInstanceTokens={allowedInstanceTokens}
            egoPose={editingEgoPose}
            addModePrev={addModePrev}
            addModeNext={addModeNext}
          />
        </RightPane>
      }
    >
      {/* NOTE: workingAnnotation の '__working__' 置換は過渡期のハック。
          Step 3/4 で AnnotationViewer をストア駆動に書き換える際に解消する。 */}
      <AnnotationViewer
        sampleToken={viewSampleToken}
        instanceToken={viewInstanceToken}
        cameraChannel={selectedSensorChannel}
        location={currentMapLocation}
        calibSensorMap={calibSensorMap}
        sceneEgoPoses={egoPoses ?? []}
        onBBoxClick={isEditing ? undefined : handleBBoxClick}
        editingInstanceToken={
          editMode === 'edit' ? (viewInstanceToken ?? undefined)
          : editMode === 'add' ? '__working__'
          : undefined
        }
        workingAnnotation={
          editMode === 'add' && currentAnnotation
            ? { ...currentAnnotation, token: '__working__', instance_token: '__working__' }
            : null
        }
      />
    </MainLayout>
  )
}
