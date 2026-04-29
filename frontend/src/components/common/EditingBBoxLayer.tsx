import { Stage, Layer, Line } from 'react-konva'
import { useEditStore } from '@/store/editStore'
import { bboxCornersToGlobal, globalToSensor } from '@/lib/coordinateUtils'
import { sensorToBevPixel, type BevViewParams } from '@/lib/canvasUtils'
import type { EgoPosePoint } from '@/types/sensor'

interface Props {
    size:             number
    viewParams:       BevViewParams
    egoPose:          EgoPosePoint | undefined
    lidarCalibSensor: { translation: number[]; rotation: number[] } | undefined
}

/**
 * BEV (LIDAR_TOP) 上に編集中BBoxを Konva で描画するレイヤー
 *
 * - editStore.session が null なら何も描画しない (DOM上に存在しない)
 * - 編集中BBoxの上面 (4隅) を矩形枠で表示
 * - イベント透過 (listening=false)
 * - Step 3 では表示のみ。ドラッグ・編集機能は Step 8 で実装
 */
export default function EditingBBoxLayer({
    size, viewParams, egoPose, lidarCalibSensor,
}: Props) {
    const session           = useEditStore((s) => s.session)
    const currentAnnotation = useEditStore((s) => s.getCurrentAnnotation())

    if (!session || !currentAnnotation || !egoPose || !lidarCalibSensor) {
        return null
    }

    // BBox 8隅をグローバル → センサー座標へ変換
    const globalCorners = bboxCornersToGlobal(
        currentAnnotation.translation,
        currentAnnotation.rotation,
        currentAnnotation.size,
    )
    const sensorCorners = globalCorners.map((c) =>
        globalToSensor(c, egoPose, lidarCalibSensor)
    )

    // 上面4頂点: 前右(0), 前左(1), 後左(5), 後右(4)
    // zs配列 [hh,hh,-hh,-hh,hh,hh,-hh,-hh] より上面は [0,1,4,5]、下面は [2,3,6,7]
    const topCornersSensor = [sensorCorners[0], sensorCorners[1], sensorCorners[5], sensorCorners[4]]

    // BEVピクセル座標へ変換
    const topCornersPx = topCornersSensor.map((c) =>
        sensorToBevPixel(c[0], c[1], viewParams)
    )

    // Konva Line の points は 1次元配列 [x1, y1, x2, y2, ...]
    const points = topCornersPx.flat()

    return (
        <Stage
            width={size}
            height={size}
            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
            listening={false}
        >
            {/* Y軸反転 (PointCloudCanvas の ctx.translate/scale と同等) */}
            <Layer scaleY={-1} y={size}>
                <Line
                    points={points}
                    closed={true}
                    stroke='#FF8C00'
                    strokeWidth={2}
                    listening={false}
                />
            </Layer>
        </Stage>
    )
}
