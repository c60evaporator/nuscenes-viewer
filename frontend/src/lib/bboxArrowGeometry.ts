import { rotateVectorByQuaternion } from './coordinateUtils'

const FORWARD_LOCAL: [number, number, number] = [1, 0, 0]

/**
 * BBox の前面中心 (グローバル座標) を返す.
 * 矢印の始点として使う.
 */
export function getBBoxFrontCenter(
    translation: number[],
    rotation: number[],
    size: number[],
): [number, number, number] {
    // ローカル +X 方向に length/2 進んだ点
    const fwd = rotateVectorByQuaternion(FORWARD_LOCAL, rotation)
    const halfLen = size[1] / 2  // size[1] = length
    return [
        translation[0] + fwd[0] * halfLen,
        translation[1] + fwd[1] * halfLen,
        translation[2] + fwd[2] * halfLen,
    ]
}

/**
 * BBox の前面中心から, さらに前方に extra 進んだ点 (= 矢印の終点) を返す.
 */
export function getBBoxArrowTip(
    translation: number[],
    rotation: number[],
    size: number[],
    extraLength = 1.0,  // 前面から何 m 突き出すか (BBox の length に対する比率でも可)
): [number, number, number] {
    const fwd = rotateVectorByQuaternion(FORWARD_LOCAL, rotation)
    const halfLen = size[1] / 2
    const totalLen = halfLen + extraLength
    return [
        translation[0] + fwd[0] * totalLen,
        translation[1] + fwd[1] * totalLen,
        translation[2] + fwd[2] * totalLen,
    ]
}
