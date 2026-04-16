import { useEffect, useMemo, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import LeftPane from '@/components/layout/LeftPane'
import RightPane from '@/components/layout/RightPane'
import AnnotationFilter from '@/components/annotation/AnnotationFilter'
import AnnotationList from '@/components/annotation/AnnotationList'
import AnnotationViewer from '@/components/annotation/AnnotationViewer'
import AnnotationInfo from '@/components/annotation/AnnotationInfo'
import { useScenes, useSceneEgoPoses } from '@/api/scenes'
import { useLogsByLocation } from '@/api/logs'
import { useSamples, useSampleAnnotations, useSampleInstances } from '@/api/samples'
import { useCategories } from '@/api/categories'
import { useCalibratedSensors } from '@/api/sensors'
import { useViewerStore } from '@/store/viewerStore'
import { useNavigationStore } from '@/store/navigationStore'
import type { CalibratedSensor } from '@/types/sensor'
import type { TabId } from '@/components/layout/Header'

interface AnnotationPageProps {
  activeTab:   TabId
  onTabChange: (tab: TabId) => void
}

export default function AnnotationPage({ activeTab, onTabChange }: AnnotationPageProps) {
  const currentMapLocation      = useViewerStore((s) => s.currentMapLocation)
  const currentAnnotationToken  = useViewerStore((s) => s.currentAnnotationToken)
  const setAnnotation           = useViewerStore((s) => s.setAnnotation)
  const lockedSceneToken        = useNavigationStore((s) => s.lockedSceneToken)
  const lockedSampleToken       = useNavigationStore((s) => s.lockedSampleToken)
  const lockedInstanceToken     = useNavigationStore((s) => s.lockedInstanceToken)
  const lockSource              = useNavigationStore((s) => s.lockSource)

  // フィルタ state
  const [selectedSceneToken,    setSelectedSceneToken]    = useState<string | null>(lockedSceneToken ?? null)
  const [selectedSampleToken,   setSelectedSampleToken]   = useState<string | null>(lockedSampleToken ?? null)
  const [selectedCategoryToken, setSelectedCategoryToken] = useState<string | null>(null)
  const [selectedInstanceToken, setSelectedInstanceToken] = useState<string | null>(lockedInstanceToken ?? null)

  // ロック判定
  const sceneTokenLocked    = !!lockedSceneToken
  const sampleTokenLocked   = lockSource === 'sample'  && !!lockedSampleToken
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

  // 初期 Scene の設定
  useEffect(() => {
    if (lockedSceneToken) {
      setSelectedSceneToken(lockedSceneToken)
    } else if (!selectedSceneToken && locationScenes.length > 0) {
      setSelectedSceneToken(locationScenes[0].token)
    }
  }, [lockedSceneToken, locationScenes, selectedSceneToken])

  // Sample リスト（Scene に紐づく）
  const { data: samplesRaw } = useSamples(selectedSceneToken)
  const samples = useMemo(
    () => [...(samplesRaw ?? [])].sort((a, b) => a.timestamp - b.timestamp),
    [samplesRaw],
  )

  // 有効なサンプルトークン
  const effectiveSampleToken = lockedSampleToken ?? selectedSampleToken

  // Instance サマリ（Sample に紐づく）
  const { data: instanceSummaries } = useSampleInstances(effectiveSampleToken)

  // アノテーションソース
  const { data: sampleAnnotationsRaw } = useSampleAnnotations(effectiveSampleToken)

  // カテゴリ
  const { data: categoriesData } = useCategories()
  const categories = categoriesData ?? []

  const categoryMap = useMemo<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    categories.forEach((c) => { m[c.token] = c.name })
    return m
  }, [categories])

  // クライアント側フィルタリング
  const filteredAnnotations = useMemo(() => {
    let anns = sampleAnnotationsRaw ?? []
    if (selectedCategoryToken) {
      anns = anns.filter((a) => a.category_token === selectedCategoryToken)
    }
    if (selectedInstanceToken) {
      anns = anns.filter((a) => a.instance_token === selectedInstanceToken)
    }
    return anns
  }, [sampleAnnotationsRaw, selectedCategoryToken, selectedInstanceToken])

  // 選択アノテーション
  const selectedAnnotation = useMemo(
    () => filteredAnnotations.find((a) => a.token === currentAnnotationToken) ?? null,
    [filteredAnnotations, currentAnnotationToken],
  )

  // Calibrated Sensors
  const { data: calibSensorsData } = useCalibratedSensors()
  const calibSensorMap = useMemo<Record<string, CalibratedSensor>>(() => {
    const map: Record<string, CalibratedSensor> = {}
    calibSensorsData?.items.forEach((cs) => { map[cs.sensor_channel] = cs })
    return map
  }, [calibSensorsData])

  // Ego Poses
  const { data: egoPoses } = useSceneEgoPoses(selectedSceneToken)

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
              categories={categories}
              selectedCategoryToken={selectedCategoryToken}
              onCategoryChange={setSelectedCategoryToken}
              instanceSummaries={instanceSummaries ?? []}
              selectedInstanceToken={selectedInstanceToken}
              onInstanceChange={setSelectedInstanceToken}
              instanceTokenLocked={instanceTokenLocked}
            />
          }
        >
          <AnnotationList
            annotations={filteredAnnotations}
            currentAnnotationToken={currentAnnotationToken}
            onSelect={setAnnotation}
            categoryMap={categoryMap}
          />
        </LeftPane>
      }
      right={
        <RightPane>
          <AnnotationInfo
            annotation={selectedAnnotation}
            categoryMap={categoryMap}
          />
        </RightPane>
      }
    >
      <AnnotationViewer
        annotation={selectedAnnotation}
        location={currentMapLocation}
        calibSensorMap={calibSensorMap}
        sceneEgoPoses={egoPoses ?? []}
      />
    </MainLayout>
  )
}
