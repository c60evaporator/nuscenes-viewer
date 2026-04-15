import type { ReactNode } from 'react'
import Header, { type TabId } from './Header'

interface MainLayoutProps {
  activeTab:   TabId
  onTabChange: (tab: TabId) => void
  left?:       ReactNode   // 左 280px ペイン
  children:    ReactNode   // 中央 flex ペイン
  right?:      ReactNode   // 右 280px ペイン
}

export default function MainLayout({
  activeTab,
  onTabChange,
  left,
  children,
  right,
}: MainLayoutProps) {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-50">
      <Header activeTab={activeTab} onTabChange={onTabChange} />

      <div className="flex flex-1 overflow-hidden">
        {/* 左ペイン */}
        {left && (
          <aside className="w-[280px] flex-shrink-0 flex flex-col overflow-hidden border-r border-gray-200">
            {left}
          </aside>
        )}

        {/* 中央ペイン */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {children}
        </main>

        {/* 右ペイン */}
        {right && (
          <aside className="w-[280px] flex-shrink-0 flex flex-col overflow-hidden border-l border-gray-200">
            {right}
          </aside>
        )}
      </div>
    </div>
  )
}
