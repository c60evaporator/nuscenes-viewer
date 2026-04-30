import {
    egoOffsetToGlobalOffset,
    multiplyQuaternions,
    axisAngleToQuaternion,
} from './coordinateUtils'
import type { Annotation } from '@/types/annotation'

export const TRANSLATION_STEP = 0.1
export const ROTATION_STEP    = 5
export const SIZE_STEP        = 0.1
export const SIZE_MIN         = 0.1

export type EgoDirection = 'x+' | 'x-' | 'y+' | 'y-'

const DIRECTION_VECTORS: Record<EgoDirection, [number, number, number]> = {
    'x+': [+TRANSLATION_STEP, 0, 0],
    'x-': [-TRANSLATION_STEP, 0, 0],
    'y+': [0, +TRANSLATION_STEP, 0],
    'y-': [0, -TRANSLATION_STEP, 0],
}

/** ego座標系の指定方向に1ステップ並進する */
export function translateAnnotation(
    ann:       Annotation,
    direction: EgoDirection,
    egoPose:   { rotation: number[] },
): Annotation {
    const globalOffset = egoOffsetToGlobalOffset(DIRECTION_VECTORS[direction], egoPose)
    return {
        ...ann,
        translation: [
            ann.translation[0] + globalOffset[0],
            ann.translation[1] + globalOffset[1],
            ann.translation[2] + globalOffset[2],
        ],
    }
}

/**
 * グローバルz軸まわりに ROTATION_STEP度 回転する
 * @param clockwise true = 時計回り (z軸負方向)
 */
export function rotateAnnotation(ann: Annotation, clockwise: boolean): Annotation {
    const angleRad = (clockwise ? -ROTATION_STEP : +ROTATION_STEP) * Math.PI / 180
    const qDelta   = axisAngleToQuaternion([0, 0, 1], angleRad)
    return { ...ann, rotation: multiplyQuaternions(qDelta, ann.rotation) }
}

/**
 * 指定軸のサイズを1ステップ変更する（中心固定）
 * @param axis 0: width, 1: length, 2: height
 * @param sign +1 (拡大) or -1 (縮小)
 */
export function resizeAnnotation(ann: Annotation, axis: 0 | 1 | 2, sign: 1 | -1): Annotation {
    const newSize = [...ann.size]
    newSize[axis] = Math.max(SIZE_MIN, newSize[axis] + sign * SIZE_STEP)
    return { ...ann, size: newSize }
}
