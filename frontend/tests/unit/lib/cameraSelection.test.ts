import { describe, it, expect } from 'vitest'
import { computeCameraScore, rankCamerasByScore } from '@/lib/cameraSelection'
import type { CalibratedSensor, EgoPosePoint } from '@/types/sensor'

const baseEgo: EgoPosePoint = {
    sample_token: 'dummy',
    timestamp:    0,
    translation:  [0, 0, 0],
    rotation:     [1, 0, 0, 0],
}

const dummyIntrinsic = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]

function makeCamera(channel: string, rotation: number[]): CalibratedSensor {
    return {
        token:            `t-${channel}`,
        sensor_token:     's',
        channel,
        modality:         'camera',
        translation:      [0, 0, 0],
        rotation,
        camera_intrinsic: dummyIntrinsic,
    }
}

describe('computeCameraScore', () => {
    const cameraForward = makeCamera('CAM_FRONT', [1, 0, 0, 0])

    it('カメラ前方 (z軸正方向) はスコア1.0近く', () => {
        const score = computeCameraScore([0, 0, 10], baseEgo, cameraForward)
        expect(score).toBeCloseTo(1.0, 5)
    })

    it('カメラ後方 (z軸負方向) はスコア-1.0近く', () => {
        const score = computeCameraScore([0, 0, -10], baseEgo, cameraForward)
        expect(score).toBeCloseTo(-1.0, 5)
    })

    it('カメラ真横 (x軸方向) はスコア0近く', () => {
        const score = computeCameraScore([10, 0, 0], baseEgo, cameraForward)
        expect(score).toBeCloseTo(0, 5)
    })

    it('annotationがego原点と一致 (norm=0) は -Infinity', () => {
        const score = computeCameraScore([0, 0, 0], baseEgo, cameraForward)
        expect(score).toBe(-Infinity)
    })
})

describe('rankCamerasByScore', () => {
    it('camera_intrinsicを持つもののみ含まれる', () => {
        const cams: CalibratedSensor[] = [
            makeCamera('CAM_FRONT', [1, 0, 0, 0]),
            { ...makeCamera('LIDAR_TOP', [1, 0, 0, 0]), camera_intrinsic: null },
        ]
        const ranked = rankCamerasByScore([0, 0, 10], baseEgo, cams)
        expect(ranked.length).toBe(1)
        expect(ranked[0].channel).toBe('CAM_FRONT')
    })

    it('スコア降順でソート', () => {
        // CAM_BACK は y軸180°回転 [w=0, x=0, y=1, z=0] → z軸が反転
        const cams: CalibratedSensor[] = [
            makeCamera('CAM_BACK',  [0, 0, 1, 0]),
            makeCamera('CAM_FRONT', [1, 0, 0, 0]),
        ]
        const ranked = rankCamerasByScore([0, 0, 10], baseEgo, cams)
        expect(ranked[0].channel).toBe('CAM_FRONT')
        expect(ranked[1].channel).toBe('CAM_BACK')
    })

    it('カメラが空の場合は空配列を返す', () => {
        expect(rankCamerasByScore([0, 0, 10], baseEgo, [])).toEqual([])
    })

    it('全てLiDAR (camera_intrinsic=null) の場合は空配列', () => {
        const cams: CalibratedSensor[] = [
            { ...makeCamera('LIDAR_TOP', [1, 0, 0, 0]), camera_intrinsic: null },
        ]
        expect(rankCamerasByScore([0, 0, 10], baseEgo, cams)).toEqual([])
    })
})
