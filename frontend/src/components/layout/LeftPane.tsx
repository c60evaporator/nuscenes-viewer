import type { ReactNode } from 'react'

interface LeftPaneProps {
  filter?:  ReactNode   // 上部フィルタ群（bg: #606060）
  footer?:  ReactNode   // 下部固定フッター（スライダー等）
  children: ReactNode   // スクロールリスト（白背景）
}

export default function LeftPane({ filter, footer, children }: LeftPaneProps) {
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
      <div className="flex-1 min-h-0 overflow-y-auto bg-white">
        {children}
      </div>
      {footer && (
        <div style={{ flexShrink: 0, borderTop: '1px solid #e5e7eb' }}>
          {footer}
        </div>
      )}
    </div>
  )
}
