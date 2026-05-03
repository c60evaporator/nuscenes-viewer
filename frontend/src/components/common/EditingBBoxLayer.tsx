import { useRef } from 'react'
import { Stage, Layer, Line } from 'react-konva'
import type Konva from 'konva'
import { useEditStore } from '@/store/editStore'
import { bboxCornersToGlobal, globalToSensor, sensorToGlobal } from '@/lib/coordinateUtils'
import { sensorToBevPixel, bevPixelToSensor, type BevViewParams } from '@/lib/canvasUtils'
import type { EgoPosePoint } from '@/types/sensor'
import type { Annotation } from '@/types/annotation'

interface Props {
    size:             number
    viewParams:       BevViewParams
    egoPose:          EgoPosePoint | undefined
    lidarCalibSensor: { translation: number[]; rotation: number[] } | undefined
}

/** BBox 上面4頂点の Layer-local ピクセル座標を計算する */
function computeTopCornersPx(
    ann:              Annotation,
    egoPose:          EgoPosePoint,
    lidarCalibSensor: { translation: number[]; rotation: number[] },
    viewParams:       BevViewParams,
): [number, number][] {
    const globalCorners = bboxCornersToGlobal(ann.translation, ann.rotation, ann.size)
    const sensorCorners = globalCorners.map((c) => globalToSensor(c, egoPose, lidarCalibSensor))
    // 上面4頂点: 前右(0), 前左(1), 後左(5), 後右(4) — zs配列より上面は [0,1,4,5]
    const top = [sensorCorners[0], sensorCorners[1], sensorCorners[5], sensorCorners[4]]
    return top.map((c) => sensorToBevPixel(c[0], c[1], viewParams))
}

/**
 * BEV (LIDAR_TOP) 上に編集中BBoxを Konva で描画・ドラッグ操作するレイヤー
 *
 * - editStore.session が null なら何も描画しない
 * - 編集中BBoxの上面 (4隅) をオレンジ矩形枠で表示
 * - ドラッグで並進移動。ドラッグ中は Konva の position offset で表示、
 *   他ビューは updateSessionLive でリアルタイム同期
 * - 1ドラッグ = 1履歴ステップ (ドラッグ終了時に commitChange)
 */
export default function EditingBBoxLayer({
    size, viewParams, egoPose, lidarCalibSensor,
}: Props) {
    const session           = useEditStore((s) => s.session)
    const currentAnnotation = useEditStore((s) => s.getCurrentAnnotation())
    const updateSessionLive = useEditStore((s) => s.updateSessionLive)
    const commitChange      = useEditStore((s) => s.commitChange)

    // ドラッグ中の表示凍結用: points を再計算しないようにする
    const isDraggingRef           = useRef(false)
    const frozenAnnotationRef     = useRef<Annotation | null>(null)
    // ドラッグ開始時の BBox 中心 (Layer-local px)
    const dragStartCenterPxRef    = useRef<{ x: number; y: number } | null>(null)
    // ドラッグ開始時の sensor z 座標（BEV 操作中は z を維持する）
    const dragStartSensorZRef     = useRef<number>(0)

    if (!session || !currentAnnotation || !egoPose || !lidarCalibSensor) return null

    // 表示用 annotation: ドラッグ中は凍結値を使い、Konva の position offset で動かす
    const renderedAnnotation = (isDraggingRef.current && frozenAnnotationRef.current)
        ? frozenAnnotationRef.current
        : currentAnnotation

    const topCornersPx = computeTopCornersPx(renderedAnnotation, egoPose, lidarCalibSensor, viewParams)
    const points = topCornersPx.flat()

    // ── ドラッグハンドラ ────────────────────────────────────────────────────────

    const handleDragStart = (e: Konva.KonvaEventObject<MouseEvent>) => {
        e.cancelBubble = true
        e.evt?.stopPropagation?.()

        isDraggingRef.current     = true
        frozenAnnotationRef.current = currentAnnotation

        // BBox 中心の Layer-local 座標 (4頂点の重心)
        const cx = (topCornersPx[0][0] + topCornersPx[1][0] + topCornersPx[2][0] + topCornersPx[3][0]) / 4
        const cy = (topCornersPx[0][1] + topCornersPx[1][1] + topCornersPx[2][1] + topCornersPx[3][1]) / 4
        dragStartCenterPxRef.current = { x: cx, y: cy }

        // ドラッグ中は z を変えないので開始時の sensor z を記録
        const startSensor = globalToSensor(currentAnnotation.translation, egoPose, lidarCalibSensor)
        dragStartSensorZRef.current = startSensor[2]
    }

    const handleDragMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
        const startCenter = dragStartCenterPxRef.current
        if (!startCenter || !egoPose || !lidarCalibSensor) return

        const node   = e.target as Konva.Line
        const offset = node.position()   // Layer-local ドラッグオフセット

        // 開始時中心 + オフセット = 現在の中心 (Layer-local)
        const newCenterX = startCenter.x + offset.x
        const newCenterY = startCenter.y + offset.y

        // Layer-local → センサー座標 → グローバル座標
        const [sensorX, sensorY] = bevPixelToSensor(newCenterX, newCenterY, viewParams)
        const newGlobal = sensorToGlobal(
            [sensorX, sensorY, dragStartSensorZRef.current],
            egoPose,
            lidarCalibSensor,
        )

        updateSessionLive({ translation: newGlobal })
    }

    const handleDragEnd = (e: Konva.KonvaEventObject<MouseEvent>) => {
        // 最終位置で確定
        handleDragMove(e)
        commitChange()

        // Konva の position offset をリセット (次回描画で points から正しく再描画される)
        const node = e.target as Konva.Line
        node.position({ x: 0, y: 0 })

        // 凍結解除
        isDraggingRef.current       = false
        frozenAnnotationRef.current = null
        dragStartCenterPxRef.current = null
    }

    return (
        <Stage
            width={size}
            height={size}
            style={{ position: 'absolute', top: 0, left: 0 }}
        >
            {/* Y軸反転: PointCloudCanvas の ctx.translate(0,h) + scale(1,-1) と同等 */}
            <Layer scaleY={-1} y={size}>
                <Line
                    points={points}
                    closed={true}
                    stroke='#FF8C00'
                    strokeWidth={2}
                    draggable={true}
                    onDragStart={handleDragStart}
                    onDragMove={handleDragMove}
                    onDragEnd={handleDragEnd}
                    onMouseEnter={(e) => {
                        const stage = e.target.getStage()
                        if (stage) stage.container().style.cursor = 'move'
                    }}
                    onMouseLeave={(e) => {
                        const stage = e.target.getStage()
                        if (stage) stage.container().style.cursor = ''
                    }}
                />
            </Layer>
        </Stage>
    )
}
