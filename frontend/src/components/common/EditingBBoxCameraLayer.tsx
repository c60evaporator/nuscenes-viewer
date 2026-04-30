import { Stage, Layer, Line } from 'react-konva'
import { useEditStore } from '@/store/editStore'
import { bboxCornersToGlobal, project3DTo2D } from '@/lib/coordinateUtils'
import type { CalibratedSensor } from '@/types/sensor'

interface Props {
    displayW: number
    displayH: number
    offsetX:  number
    offsetY:  number
    scaleX:   number
    scaleY:   number
    calibratedSensor: CalibratedSensor
    egoPose:  { translation: number[]; rotation: number[] } | undefined
}

/**
 * カメラ画像上に編集中BBoxを Konva で立方体描画するレイヤー
 *
 * - editStore.session が null なら何も描画しない
 * - 8隅を投影して12辺を Line で結ぶ
 * - カメラ後方 (z<=0) の頂点を含む辺はスキップ
 * - イベント透過 (listening=false)
 */
export default function EditingBBoxCameraLayer({
    displayW, displayH, offsetX, offsetY, scaleX, scaleY,
    calibratedSensor, egoPose,
}: Props) {
    const session           = useEditStore((s) => s.session)
    const currentAnnotation = useEditStore((s) => s.getCurrentAnnotation())

    if (!session || !currentAnnotation || !egoPose || !calibratedSensor.camera_intrinsic) {
        return null
    }

    const calibArray = {
        translation: calibratedSensor.translation,
        rotation:    calibratedSensor.rotation,
    }

    const globalCorners = bboxCornersToGlobal(
        currentAnnotation.translation,
        currentAnnotation.rotation,
        currentAnnotation.size,
    )

    const corners2D: ([number, number] | null)[] = globalCorners.map((corner) => {
        const px = project3DTo2D(corner, calibratedSensor.camera_intrinsic!, egoPose, calibArray)
        if (!px) return null
        return [px[0] * scaleX, px[1] * scaleY]
    })

    // 12辺: 前面(0-1,1-2,2-3,3-0), 後面(4-5,5-6,6-7,7-4), 縦辺(0-4,1-5,2-6,3-7)
    const edges: [number, number][] = [
        [0, 1], [1, 2], [2, 3], [3, 0],
        [4, 5], [5, 6], [6, 7], [7, 4],
        [0, 4], [1, 5], [2, 6], [3, 7],
    ]

    const validEdges = edges
        .map(([a, b]) => {
            const pa = corners2D[a]
            const pb = corners2D[b]
            if (!pa || !pb) return null
            return [pa, pb] as [[number, number], [number, number]]
        })
        .filter((e): e is [[number, number], [number, number]] => e !== null)

    if (validEdges.length === 0) return null

    return (
        <Stage
            width={displayW}
            height={displayH}
            style={{ position: 'absolute', top: offsetY, left: offsetX, pointerEvents: 'none' }}
            listening={false}
        >
            <Layer>
                {validEdges.map(([pa, pb], i) => (
                    <Line
                        key={i}
                        points={[pa[0], pa[1], pb[0], pb[1]]}
                        stroke='#FF8C00'
                        strokeWidth={2}
                        listening={false}
                    />
                ))}
            </Layer>
        </Stage>
    )
}
