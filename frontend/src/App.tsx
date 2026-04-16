import { useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import ScenePage from '@/pages/ScenePage'
import SamplePage from '@/pages/SamplePage'
import MapPage from '@/pages/MapPage'
import InstancePage from '@/pages/InstancePage'
import AnnotationPage from '@/pages/AnnotationPage'
import SampleMapPage from '@/pages/SampleMapPage'
import type { TabId } from '@/components/layout/Header'

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('scene')

  if (activeTab === 'scene') {
    return <ScenePage activeTab={activeTab} onTabChange={setActiveTab} />
  }

  if (activeTab === 'sample') {
    return <SamplePage activeTab={activeTab} onTabChange={setActiveTab} />
  }

  if (activeTab === 'instance') {
    return <InstancePage activeTab={activeTab} onTabChange={setActiveTab} />
  }

  if (activeTab === 'annotation') {
    return <AnnotationPage activeTab={activeTab} onTabChange={setActiveTab} />
  }

  if (activeTab === 'map') {
    return <MapPage activeTab={activeTab} onTabChange={setActiveTab} />
  }

  if (activeTab === 'sample-map') {
    return <SampleMapPage activeTab={activeTab} onTabChange={setActiveTab} />
  }

  return (
    <MainLayout activeTab={activeTab} onTabChange={setActiveTab}>
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        {activeTab} screen (coming soon)
      </div>
    </MainLayout>
  )
}
