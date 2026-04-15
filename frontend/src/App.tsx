import { useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import LeftPane from '@/components/layout/LeftPane'
import RightPane from '@/components/layout/RightPane'
import { Button } from '@/components/ui/button'
import type { TabId } from '@/components/layout/Header'

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('scene')

  return (
    <MainLayout
      activeTab={activeTab}
      onTabChange={setActiveTab}
      left={
        <LeftPane
          filter={
            <p className="text-gray-300 text-xs">Filters</p>
          }
        >
          <p className="p-3 text-gray-400 text-sm">List items</p>
        </LeftPane>
      }
      right={
        <RightPane
          actions={
            <Button
              className="w-full text-white"
              style={{ backgroundColor: '#4A90D9' }}
            >
              Action
            </Button>
          }
        >
          <p className="text-gray-400 text-sm">Info panel</p>
        </RightPane>
      }
    >
      {/* 中央: 各画面のプレースホルダー */}
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        {activeTab} screen
      </div>
    </MainLayout>
  )
}
