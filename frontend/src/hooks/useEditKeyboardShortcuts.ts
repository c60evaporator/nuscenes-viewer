import { useEffect, useRef } from 'react'
import { useEditStore } from '@/store/editStore'
import { translateAnnotation, rotateAnnotation, resizeAnnotation, type EgoDirection } from '@/lib/bboxEditOps'
import type { EgoPosePoint } from '@/types/sensor'

const REPEAT_DELAY     = 400
const REPEAT_INTERVAL  = 100
const SHIFT_MULTIPLIER = 10
const FORM_TAGS        = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

/**
 * editStore セッション中のキーボードショートカットを登録する。
 *
 * - 矢印キー: ego x/y 並進
 * - U/O: ego z+/z- 並進
 * - Q/E: グローバルz軸 反時計/時計回り
 * - I/K: length 拡大/縮小, J/L: width 拡大/縮小
 * - Shift+各キー: 10倍ステップ
 *
 * 入力欄フォーカス中は発火しない。
 * 押下中は updateSessionLive を連続実行、リリース時に commitChange を1回。
 */
export function useEditKeyboardShortcuts({ egoPose }: { egoPose: EgoPosePoint | null }) {
    const egoPoseRef = useRef(egoPose)
    egoPoseRef.current = egoPose

    const pressedRef   = useRef(new Set<string>())
    const timeoutsRef  = useRef(new Map<string, ReturnType<typeof setTimeout>>())
    const intervalsRef = useRef(new Map<string, ReturnType<typeof setInterval>>())

    useEffect(() => {
        const getAction = (e: KeyboardEvent): (() => void) | null => {
            const mult = e.shiftKey ? SHIFT_MULTIPLIER : 1

            const translate = (dir: EgoDirection) => () => {
                const ann = useEditStore.getState().getCurrentAnnotation()
                const ego = egoPoseRef.current
                if (!ann || !ego) return
                useEditStore.getState().updateSessionLive({
                    translation: translateAnnotation(ann, dir, ego, mult).translation,
                })
            }
            const rotate = (clockwise: boolean) => () => {
                const ann = useEditStore.getState().getCurrentAnnotation()
                if (!ann) return
                useEditStore.getState().updateSessionLive({
                    rotation: rotateAnnotation(ann, clockwise, mult).rotation,
                })
            }
            const resize = (axis: 0 | 1 | 2, sign: 1 | -1) => () => {
                const ann = useEditStore.getState().getCurrentAnnotation()
                if (!ann) return
                const r = resizeAnnotation(ann, axis, sign, mult)
                useEditStore.getState().updateSessionLive({ size: r.size, translation: r.translation })
            }

            switch (e.key) {
                case 'ArrowRight': return translate('x+')
                case 'ArrowLeft':  return translate('x-')
                case 'ArrowUp':    return translate('y+')
                case 'ArrowDown':  return translate('y-')
                case 'u': case 'U': return translate('z+')
                case 'o': case 'O': return translate('z-')
                case 'q': case 'Q': return rotate(false)
                case 'e': case 'E': return rotate(true)
                case 'i': case 'I': return resize(1, +1)
                case 'k': case 'K': return resize(1, -1)
                case 'j': case 'J': return resize(0, +1)
                case 'l': case 'L': return resize(0, -1)
                default: return null
            }
        }

        const startRepeat = (code: string, action: () => void) => {
            if (pressedRef.current.has(code)) return
            pressedRef.current.add(code)
            action()
            timeoutsRef.current.set(code, setTimeout(() => {
                intervalsRef.current.set(code, setInterval(action, REPEAT_INTERVAL))
            }, REPEAT_DELAY))
        }

        const stopRepeat = (code: string) => {
            if (!pressedRef.current.has(code)) return
            pressedRef.current.delete(code)
            const t = timeoutsRef.current.get(code)
            if (t !== undefined) { clearTimeout(t); timeoutsRef.current.delete(code) }
            const iv = intervalsRef.current.get(code)
            if (iv !== undefined) { clearInterval(iv); intervalsRef.current.delete(code) }
            if (pressedRef.current.size === 0) useEditStore.getState().commitChange()
        }

        const onKeyDown = (e: KeyboardEvent) => {
            if (!useEditStore.getState().session) return
            if (FORM_TAGS.has((e.target as HTMLElement).tagName)) return
            const action = getAction(e)
            if (!action) return
            e.preventDefault()
            startRepeat(e.code, action)
        }

        const onKeyUp = (e: KeyboardEvent) => {
            if (!useEditStore.getState().session) return
            stopRepeat(e.code)
        }

        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)

        return () => {
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('keyup', onKeyUp)
            timeoutsRef.current.forEach(clearTimeout)
            intervalsRef.current.forEach(clearInterval)
            timeoutsRef.current.clear()
            intervalsRef.current.clear()
            pressedRef.current.clear()
        }
    }, [])  // マウント時に1回だけ登録。動的な値はすべて ref 経由で参照
}
