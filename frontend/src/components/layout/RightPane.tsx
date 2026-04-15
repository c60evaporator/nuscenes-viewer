import type { ReactNode } from 'react'

interface RightPaneProps {
  children:  ReactNode    // 情報表示エリア（flex: 1）
  actions?:  ReactNode    // 下部アクションボタン
}

export default function RightPane({ children, actions }: RightPaneProps) {
  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex-1 overflow-y-auto p-3">
        {children}
      </div>
      {actions && (
        <div className="flex-shrink-0 p-3 border-t border-gray-200 flex flex-col gap-2">
          {actions}
        </div>
      )}
    </div>
  )
}
