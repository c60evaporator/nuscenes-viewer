import { globalToSensor } from './coordinateUtils'
import type { CalibratedSensor, EgoPosePoint } from '@/types/sensor'

/** nuScenes 標準6カメラの表示順（未知チャンネルは末尾にアルファベット順で続ける） */
export const CAMERA_CHANNEL_ORDER = [
    'CAM_FRONT_LEFT', 'CAM_FRONT', 'CAM_FRONT_RIGHT',
    'CAM_BACK_LEFT', 'CAM_BACK', 'CAM_BACK_RIGHT',
]

/** カメラチャンネルを標準順に整列する（標準外は末尾にアルファベット順） */
export function sortCameraChannels(channels: string[]): string[] {
    return [...channels].sort((a, b) => {
        const ia = CAMERA_CHANNEL_ORDER.indexOf(a)
        const ib = CAMERA_CHANNEL_ORDER.indexOf(b)
        if (ia !== -1 && ib !== -1) return ia - ib
        if (ia !== -1) return -1
        if (ib !== -1) return 1
        return a.localeCompare(b)
    })
}

/**
 * アノテーション未選択時のデフォルトカメラチャンネル
 * CAM_FRONT を優先（Sample&Map 画面のデフォルトと整合）、なければ標準順の先頭
 */
export function pickDefaultCameraChannel(channels: string[]): string | null {
    if (channels.includes('CAM_FRONT')) return 'CAM_FRONT'
    return sortCameraChannels(channels)[0] ?? null
}

/**
 * カメラ光軸 (z軸) と annotation中心位置のコサイン類似度
 * バックエンド _camera_score と等価
 *
 * @returns -1.0〜1.0、norm=0なら -Infinity
 */
export function computeCameraScore(
    annTranslation: number[],
    egoPose:        { translation: number[]; rotation: number[] },
    calibSensor:    { translation: number[]; rotation: number[] },
): number {
    const pCam = globalToSensor(annTranslation, egoPose, calibSensor)
    const norm = Math.sqrt(pCam[0] ** 2 + pCam[1] ** 2 + pCam[2] ** 2)
    if (norm < 1e-6) return -Infinity
    return pCam[2] / norm
}

/**
 * カメラを「映りの良い順」にソートして返す
 * camera_intrinsic を持つもの = カメラセンサーのみ対象
 *
 * @param annTranslation 編集中BBoxの中心グローバル座標
 * @param egoPose        対象 sample の ego pose
 * @param calibSensors   全 calibrated sensor の配列
 * @returns              スコア降順のカメラリスト
 */
export function rankCamerasByScore(
    annTranslation: number[],
    egoPose:        EgoPosePoint,
    calibSensors:   CalibratedSensor[],
): CalibratedSensor[] {
    return calibSensors
        .filter((cs) => cs.camera_intrinsic !== null && cs.camera_intrinsic !== undefined)
        .map((cs) => ({
            cs,
            score: computeCameraScore(annTranslation, egoPose, cs),
        }))
        .sort((a, b) => b.score - a.score)
        .map(({ cs }) => cs)
}
