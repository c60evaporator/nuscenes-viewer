import { Stage, Layer, Group, Line, Arrow } from 'react-konva'
import { useEditStore } from '@/store/editStore'
import { bboxCornersToGlobal, project3DTo2D } from '@/lib/coordinateUtils'
import { getBBoxFrontCenter, getBBoxArrowTip } from '@/lib/bboxArrowGeometry'
import type { CalibratedSensor } from '@/types/sensor'

interface Props {
    displayW:   number
    displayH:   number
    offsetX:    number
    offsetY:    number
    scaleX:     number
    scaleY:     number
    containerW: number
    containerH: number
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
    offsetX, offsetY, scaleX, scaleY, containerW, containerH,
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

    // 矢印の描画判定
    const arrowExtra = Math.min(1.0, currentAnnotation.size[1] * 0.3)
    const arrowStartGlobal = getBBoxFrontCenter(
        currentAnnotation.translation,
        currentAnnotation.rotation,
        currentAnnotation.size,
    )
    const arrowEndGlobal = getBBoxArrowTip(
        currentAnnotation.translation,
        currentAnnotation.rotation,
        currentAnnotation.size,
        arrowExtra,
    )
    // グローバル → カメラ画像座標へ投影
    const arrowStartPx = project3DTo2D(arrowStartGlobal, calibratedSensor.camera_intrinsic, egoPose, calibArray)
    const arrowEndPx   = project3DTo2D(arrowEndGlobal,   calibratedSensor.camera_intrinsic, egoPose, calibArray)
    // 両方の投影が有効な場合のみ描画
    const arrowVisible = arrowStartPx !== null && arrowEndPx !== null

    // Stage はコンテナサイズ・原点固定とし、パン・ズームのオフセットは Group に持たせる
    // （高ズーム時に Stage バッファが肥大しないようにするため）
    return (
        <Stage
            width={containerW}
            height={containerH}
            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
            listening={false}
        >
            <Layer>
                <Group x={offsetX} y={offsetY}>
                    {validEdges.map(([pa, pb], i) => (
                        <Line
                            key={i}
                            points={[pa[0], pa[1], pb[0], pb[1]]}
                            stroke='#FF8C00'
                            strokeWidth={2}
                            listening={false}
                        />
                    ))}
                    {arrowVisible && (
                        <Arrow
                            points={[
                                arrowStartPx![0] * scaleX, arrowStartPx![1] * scaleY,
                                arrowEndPx![0]   * scaleX, arrowEndPx![1]   * scaleY,
                            ]}
                            stroke='#FF8C00'
                            fill='#FF8C00'
                            strokeWidth={3}
                            pointerLength={10}
                            pointerWidth={10}
                            listening={false}
                        />
                    )}
                </Group>
            </Layer>
        </Stage>
    )
}
