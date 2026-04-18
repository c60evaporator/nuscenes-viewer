import { useEffect, useMemo, useState } from 'react'
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
import { useCategories } from '@/api/categories'
import { useCalibratedSensors } from '@/api/sensors'
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
      setSelectedCategoryName(null)
      setInstance(null)
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

  // カテゴリリスト
  const { data: categoriesData } = useCategories()
  const categories = categoriesData ?? []

  // インスタンスリスト
  const { data: instancesData } = useInstances({
    sceneToken:   selectedSceneToken ?? undefined,
    categoryName: selectedCategoryName ?? undefined,
    limit: 200,
  })
  const instances = instancesData?.items ?? []

  // 選択インスタンスのアノテーション（timestamp 昇順）
  const { data: annotationsRaw } = useInstanceAnnotations(currentInstanceToken)
  const allAnnotations = useMemo(
    () => [...(annotationsRaw ?? [])].sort((a, b) => a.timestamp - b.timestamp),
    [annotationsRaw],
  )

  // スライダーインデックスをアノテーション変更時にリセット（中央に設定）
  useEffect(() => {
    if (allAnnotations.length > 0) {
      setCurrentAnnotationIndex(Math.floor(allAnnotations.length / 2))
    } else {
      setCurrentAnnotationIndex(0)
    }
  }, [currentInstanceToken, allAnnotations.length])

  const currentAnnotation = allAnnotations[currentAnnotationIndex] ?? null

  // Calibrated Sensors
  const { data: calibSensorsData } = useCalibratedSensors()
  const calibSensorMap = useMemo<Record<string, CalibratedSensor>>(() => {
    const map: Record<string, CalibratedSensor> = {}
    calibSensorsData?.items.forEach((cs) => { map[cs.sensor_channel] = cs })
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
        >
          <InstanceList
            instances={instances}
            currentInstanceToken={currentInstanceToken}
            onSelect={setInstance}
          />
          <InstanceSampleSlider
            annotations={allAnnotations}
            selectedIndex={currentAnnotationIndex}
            onIndexChange={setCurrentAnnotationIndex}
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
      />
    </MainLayout>
  )
}
