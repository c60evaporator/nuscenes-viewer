import type { ReactNode } from 'react'

interface LeftPaneProps {
  filter?:  ReactNode   // 上部フィルタ群（bg: #606060）
  children: ReactNode   // 下部リスト（白背景）
}

export default function LeftPane({ filter, children }: LeftPaneProps) {
  return (
    <div className="flex flex-col h-full">
      {filter && (
        <div
          className="flex-shrink-0 p-3 space-y-2"
          style={{ backgroundColor: '#606060' }}
        >
          {filter}
        </div>
      )}
      <div className="flex-1 overflow-y-auto bg-white">
        {children}
      </div>
    </div>
  )
}
