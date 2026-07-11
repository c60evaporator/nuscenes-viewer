import { useMemo, useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import LeftPane from '@/components/layout/LeftPane'
import RightPane from '@/components/layout/RightPane'
import { Button } from '@/components/ui/button'
import InstanceFilter from '@/components/instance/InstanceFilter'
import InstanceList from '@/components/instance/InstanceList'
import InstanceSampleSlider from '@/components/instance/InstanceSampleSlider'
import InstanceViewer from '@/components/instance/InstanceViewer'
import InstanceInfo from '@/components/instance/InstanceInfo'
import { useScenes, useSceneEgoPoses } from '@/api/scenes'
import { useLogsByLocation } from '@/api/logs'
import { useInstances, useInstanceAnnotations } from '@/api/instances'
import { useSampleAnnotations } from '@/api/samples'
import { useCategories } from '@/api/categories'
import { useCalibratedSensors } from '@/api/sensors'
import { compareCategoryOrder } from '@/lib/categoryOrder'
import { useViewerStore } from '@/store/viewerStore'
import { useNavigationStore } from '@/store/navigationStore'
import type { CalibratedSensor } from '@/types/sensor'
import type { TabId } from '@/components/layout/Header'

interface InstancePageProps {
  activeTab:   TabId
  onTabChange: (tab: TabId) => void
}

export default function InstancePage({ activeTab, onTabChange }: InstancePageProps) {
  const currentMapLocation    = useViewerStore((s) => s.currentMapLocation)
  const currentInstanceToken  = useViewerStore((s) => s.currentInstanceToken)
  const setInstance           = useViewerStore((s) => s.setInstance)
  const lock                  = useNavigationStore((s) => s.lock)
  const lockedSceneToken      = useNavigationStore((s) => s.lockedSceneToken)
  const lockedCategoryName    = useNavigationStore((s) => s.lockedCategoryName)

  const [selectedSceneToken,   setSelectedSceneToken]   = useState<string | null>(lockedSceneToken ?? null)
  const [selectedCategoryName, setSelectedCategoryName] = useState<string | null>(lockedCategoryName ?? null)
  const [currentAnnotationIndex, setCurrentAnnotationIndex] = useState(0)
  const [highlightAnnToken, setHighlightAnnToken] = useState<string | null>(null)

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
      setSelectedCategoryName(null)
      setInstance(null)
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

  // カテゴリリスト（settings.yml annotation.category_order の順に表示）
  const { data: categoriesData } = useCategories()
  const categories = useMemo(
    () => [...(categoriesData ?? [])].sort((a, b) => compareCategoryOrder(a.name, b.name)),
    [categoriesData],
  )

  // インスタンスリスト
  const { data: instancesData } = useInstances({
    sceneToken:   selectedSceneToken ?? undefined,
    categoryName: selectedCategoryName ?? undefined,
    limit: 200,
  })
  // settings.yml annotation.category_order の順に表示（同一カテゴリ内は token 順）
  const instances = useMemo(
    () => [...(instancesData?.items ?? [])].sort((a, b) =>
      compareCategoryOrder(a.category_name, b.category_name) || a.token.localeCompare(b.token)
    ),
    [instancesData],
  )

  // 選択インスタンスのアノテーション（timestamp 昇順）
  const { data: annotationsRaw } = useInstanceAnnotations(currentInstanceToken)
  const allAnnotations = useMemo(
    () => [...(annotationsRaw ?? [])].sort((a, b) => a.timestamp - b.timestamp),
    [annotationsRaw],
  )

  // スライダーインデックスをアノテーション変更時にリセット（中央に設定、派生 state）
  const instanceAnnKey = `${currentInstanceToken ?? ''}-${allAnnotations.length}`
  const [prevInstanceAnnKey, setPrevInstanceAnnKey] = useState(instanceAnnKey)
  if (prevInstanceAnnKey !== instanceAnnKey) {
    setPrevInstanceAnnKey(instanceAnnKey)
    setCurrentAnnotationIndex(allAnnotations.length > 0 ? Math.floor(allAnnotations.length / 2) : 0)
  }

  const currentAnnotation = allAnnotations[currentAnnotationIndex] ?? null

  // 現在サンプルの全アノテーション（BBox クリック時の instance_token 逆引き用）
  const { data: sampleAnnotations } = useSampleAnnotations(currentAnnotation?.sample_token ?? null)

  // annotation が切り替わったらハイライトをリセット（派生 state）
  const [prevAnnToken, setPrevAnnToken] = useState(currentAnnotation?.token)
  if (prevAnnToken !== currentAnnotation?.token) {
    setPrevAnnToken(currentAnnotation?.token)
    setHighlightAnnToken(null)
  }

  const handleBBoxClick = (annToken: string) => {
    setHighlightAnnToken(annToken)
    const ann = (sampleAnnotations ?? []).find((a) => a.token === annToken)
    if (ann?.instance_token) {
      setInstance(ann.instance_token)
    }
  }

  // highlightAnnToken → instance_token（サンプル全アノテーションから逆引き）
  const highlightInstanceToken = useMemo(() => {
    if (!highlightAnnToken) return currentInstanceToken
    const ann = (sampleAnnotations ?? []).find((a) => a.token === highlightAnnToken)
    return ann?.instance_token ?? currentInstanceToken
  }, [highlightAnnToken, sampleAnnotations, currentInstanceToken])

  // Calibrated Sensors
  const { data: calibSensorsData } = useCalibratedSensors()
  const calibSensorMap = useMemo<Record<string, CalibratedSensor>>(() => {
    const map: Record<string, CalibratedSensor> = {}
    calibSensorsData?.items.forEach((cs) => { map[cs.token] = cs })
    return map
  }, [calibSensorsData])

  // Ego Poses
  const { data: egoPoses } = useSceneEgoPoses(selectedSceneToken)

  const handleAnnotationsClick = () => {
    if (!currentInstanceToken) return
    lock('instance', {
      sceneToken:    selectedSceneToken ?? undefined,
      instanceToken: currentInstanceToken,
    })
    onTabChange('annotation')
  }

  return (
    <MainLayout
      activeTab={activeTab}
      onTabChange={onTabChange}
      left={
        <LeftPane
          filter={
            <InstanceFilter
              scenes={locationScenes}
              selectedSceneToken={selectedSceneToken}
              onSceneChange={setSelectedSceneToken}
              sceneTokenLocked={!!lockedSceneToken}
              categories={categories}
              selectedCategoryName={selectedCategoryName}
              onCategoryChange={setSelectedCategoryName}
            />
          }
          footer={
            <InstanceSampleSlider
              annotations={allAnnotations}
              selectedIndex={currentAnnotationIndex}
              onIndexChange={setCurrentAnnotationIndex}
            />
          }
        >
          <InstanceList
            instances={instances}
            currentInstanceToken={currentInstanceToken}
            onSelect={setInstance}
            highlightInstanceToken={highlightInstanceToken}
          />
        </LeftPane>
      }
      right={
        <RightPane
          actions={
            <Button
              className="w-full text-white text-xs"
              style={{ backgroundColor: '#4A90D9' }}
              disabled={!currentInstanceToken}
              onClick={handleAnnotationsClick}
            >
              Annotations
            </Button>
          }
        >
          <InstanceInfo
            instance={instances.find((i) => i.token === currentInstanceToken) ?? null}
          />
        </RightPane>
      }
    >
      <InstanceViewer
        instanceToken={currentInstanceToken}
        currentAnnotation={currentAnnotation}
        allAnnotations={allAnnotations}
        location={currentMapLocation}
        calibSensorMap={calibSensorMap}
        sceneEgoPoses={egoPoses ?? []}
        highlightAnnToken={highlightAnnToken}
        onBBoxClick={handleBBoxClick}
      />
    </MainLayout>
  )
}
