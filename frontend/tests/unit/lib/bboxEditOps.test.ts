import { describe, it, expect } from 'vitest'
import {
    translateAnnotation,
    rotateAnnotation,
    resizeAnnotation,
    SIZE_MIN,
} from '@/lib/bboxEditOps'
import type { Annotation } from '@/types/annotation'
import type { EgoPosePoint } from '@/types/sensor'

const baseAnn: Annotation = {
    token:            't',
    sample_token:     's',
    instance_token:   'i',
    translation:      [10, 20, 1],
    rotation:         [1, 0, 0, 0],
    size:             [2, 4, 1.5],
    prev:             null,
    next:             null,
    num_lidar_pts:    0,
    num_radar_pts:    0,
    visibility_token: null,
    category_token:   '',
    attributes:       [],
    visibility:       null,
}

const identityEgo: EgoPosePoint = {
    sample_token: 's',
    timestamp:    0,
    translation:  [0, 0, 0],
    rotation:     [1, 0, 0, 0],
}

describe('translateAnnotation', () => {
    it('単位ego: x+方向はグローバルx軸方向と一致', () => {
        const updated = translateAnnotation(baseAnn, 'x+', identityEgo)
        expect(updated.translation[0]).toBeCloseTo(10.1, 5)
        expect(updated.translation[1]).toBeCloseTo(20,   5)
        expect(updated.translation[2]).toBeCloseTo(1,    5)
    })

    it('単位ego: y+方向はグローバルy軸方向と一致', () => {
        const updated = translateAnnotation(baseAnn, 'y+', identityEgo)
        expect(updated.translation[0]).toBeCloseTo(10,   5)
        expect(updated.translation[1]).toBeCloseTo(20.1, 5)
    })

    it('z軸+90度回転のego: x+方向はグローバルy軸方向に変換', () => {
        const rotatedEgo: EgoPosePoint = {
            ...identityEgo,
            rotation: [Math.cos(Math.PI / 4), 0, 0, Math.sin(Math.PI / 4)],
        }
        const updated = translateAnnotation(baseAnn, 'x+', rotatedEgo)
        expect(updated.translation[0]).toBeCloseTo(10,   5)
        expect(updated.translation[1]).toBeCloseTo(20.1, 5)
    })

    it('translation以外のフィールドは変更されない', () => {
        const updated = translateAnnotation(baseAnn, 'x+', identityEgo)
        expect(updated.size).toEqual(baseAnn.size)
        expect(updated.rotation).toEqual(baseAnn.rotation)
        expect(updated.token).toBe(baseAnn.token)
    })
})

describe('rotateAnnotation', () => {
    it('単位回転から左回転: z成分のクォータニオンが正に', () => {
        const updated = rotateAnnotation(baseAnn, false)
        expect(updated.rotation[0]).toBeCloseTo(Math.cos(2.5 * Math.PI / 180), 5)
        expect(updated.rotation[3]).toBeCloseTo(Math.sin(2.5 * Math.PI / 180), 5)
    })

    it('単位回転から右回転: z成分のクォータニオンが負に', () => {
        const updated = rotateAnnotation(baseAnn, true)
        expect(updated.rotation[3]).toBeCloseTo(-Math.sin(2.5 * Math.PI / 180), 5)
    })

    it('rotation以外のフィールドは変更されない', () => {
        const updated = rotateAnnotation(baseAnn, true)
        expect(updated.translation).toEqual(baseAnn.translation)
        expect(updated.size).toEqual(baseAnn.size)
    })

    it('10回繰り返してもクォータニオンのノルムは1を保つ', () => {
        let ann = baseAnn
        for (let i = 0; i < 10; i++) ann = rotateAnnotation(ann, true)
        const norm = Math.sqrt(ann.rotation.reduce((s, v) => s + v * v, 0))
        expect(norm).toBeCloseTo(1.0, 5)
    })
})

describe('resizeAnnotation', () => {
    it('+W (axis=0, sign=+1) で width が +0.1', () => {
        const updated = resizeAnnotation(baseAnn, 0, +1)
        expect(updated.size[0]).toBeCloseTo(2.1, 5)
        expect(updated.size[1]).toBeCloseTo(4,   5)
        expect(updated.size[2]).toBeCloseTo(1.5, 5)
    })

    it('+L で length が +0.1', () => {
        expect(resizeAnnotation(baseAnn, 1, +1).size[1]).toBeCloseTo(4.1, 5)
    })

    it('+H で height が +0.1 かつ translation_z が +0.05 (下面固定)', () => {
        const updated = resizeAnnotation(baseAnn, 2, +1)
        expect(updated.size[2]).toBeCloseTo(1.6, 5)
        expect(updated.translation[2]).toBeCloseTo(1.05, 5)
        expect(updated.translation[0]).toBeCloseTo(baseAnn.translation[0], 5)
        expect(updated.translation[1]).toBeCloseTo(baseAnn.translation[1], 5)
    })

    it('-H で height が -0.1 かつ translation_z が -0.05 (下面固定)', () => {
        const updated = resizeAnnotation(baseAnn, 2, -1)
        expect(updated.size[2]).toBeCloseTo(1.4, 5)
        expect(updated.translation[2]).toBeCloseTo(0.95, 5)
    })

    it('-H でクランプ時は translation_z の移動量も実際の縮小量に追従', () => {
        const tiny: Annotation = { ...baseAnn, size: [2, 4, 0.15] }
        const updated = resizeAnnotation(tiny, 2, -1)
        expect(updated.size[2]).toBeCloseTo(SIZE_MIN, 5)
        // 実際の縮小量: 0.15 - 0.1 = 0.05 → translation_z -= 0.025
        expect(updated.translation[2]).toBeCloseTo(1 - 0.025, 5)
    })

    it('-W で width が -0.1', () => {
        expect(resizeAnnotation(baseAnn, 0, -1).size[0]).toBeCloseTo(1.9, 5)
    })

    it('縮小は SIZE_MIN でクランプ (W)', () => {
        const tiny: Annotation = { ...baseAnn, size: [0.15, 4, 1.5] }
        expect(resizeAnnotation(tiny, 0, -1).size[0]).toBeCloseTo(SIZE_MIN, 5)
    })

    it('W/L の変更では translation は変わらない (中心固定)', () => {
        expect(resizeAnnotation(baseAnn, 0, +1).translation).toEqual(baseAnn.translation)
        expect(resizeAnnotation(baseAnn, 1, +1).translation).toEqual(baseAnn.translation)
    })
})
