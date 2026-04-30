import { useRef } from 'react'

interface UseLongPressOptions {
    onTick:      () => void
    onRelease?:  () => void
    delay?:      number
    interval?:   number
}

/**
 * 長押し連続操作を実装するカスタムフック
 *
 * 押下時: onTick を即実行 → delay 待機 → interval 間隔で繰り返し実行
 * リリース時: 連続実行を停止 → onRelease を1回実行
 */
export function useLongPressButton({
    onTick,
    onRelease,
    delay    = 400,
    interval = 100,
}: UseLongPressOptions) {
    const timeoutRef  = useRef<ReturnType<typeof setTimeout>  | null>(null)
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const startedRef  = useRef(false)

    const stop = () => {
        if (timeoutRef.current)  { clearTimeout(timeoutRef.current);   timeoutRef.current  = null }
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
        if (startedRef.current) {
            startedRef.current = false
            onRelease?.()
        }
    }

    const start = () => {
        if (startedRef.current) return
        startedRef.current = true
        onTick()
        timeoutRef.current = setTimeout(() => {
            intervalRef.current = setInterval(onTick, interval)
        }, delay)
    }

    return {
        onMouseDown:   start,
        onMouseUp:     stop,
        onMouseLeave:  stop,
        onTouchStart:  (e: React.TouchEvent) => { e.preventDefault(); start() },
        onTouchEnd:    stop,
        onTouchCancel: stop,
    }
}
