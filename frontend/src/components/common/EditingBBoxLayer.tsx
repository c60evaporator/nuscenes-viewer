import { useEffect, useRef } from 'react'
import { Stage, Layer, Rect, Transformer } from 'react-konva'
import type Konva from 'konva'
import { useEditStore } from '@/store/editStore'
import {
    bboxCornersToGlobal,
    globalToSensor,
    sensorToGlobal,
    multiplyQuaternions,
    axisAngleToQuaternion,
} from '@/lib/coordinateUtils'
import { sensorToBevPixel, bevPixelToSensor, type BevViewParams } from '@/lib/canvasUtils'
import { SIZE_MIN } from '@/lib/bboxEditOps'
import type { EgoPosePoint } from '@/types/sensor'

interface Props {
    size:             number
    viewParams:       BevViewParams
    egoPose:          EgoPosePoint | undefined
    lidarCalibSensor: { translation: number[]; rotation: number[] } | undefined
}

/**
 * BEV (LIDAR_TOP) 上に編集中BBoxを Konva の Rect + Transformer で表示・編集する
 *
 * - editStore.session が null なら何も描画しない
 * - 上面の中心位置・サイズ (W,L)・yaw を Rect で表現
 * - draggable で並進、Transformer でリサイズ・回転
 * - 中心固定リサイズ (centeredScaling)
 * - z, height は不変 (BEV平面操作)
 * - 1操作 = 1履歴ステップ (操作終了時に commitChange)
 */
export default function EditingBBoxLayer({
    size, viewParams, egoPose, lidarCalibSensor,
}: Props) {
    const session           = useEditStore((s) => s.session)
    const currentAnnotation = useEditStore((s) => s.getCurrentAnnotation())
    const updateSessionLive = useEditStore((s) => s.updateSessionLive)
    const commitChange      = useEditStore((s) => s.commitChange)

    const rectRef        = useRef<Konva.Rect>(null)
    const transformerRef = useRef<Konva.Transformer>(null)

    // 操作中の表示凍結
    const isInteractingRef    = useRef(false)
    const frozenAnnotationRef = useRef<typeof currentAnnotation>(null)

    // 操作開始時の状態 (差分計算用)
    const startGlobalZRef             = useRef(0)
    const startSensorZRef             = useRef(0)
    const transformStartScreenYawRef  = useRef(0)
    const transformStartQuaternionRef = useRef<number[] | null>(null)
    const transformStartSizeRef       = useRef<number[] | null>(null)

    // Transformer を Rect にアタッチ (session 切替時に再アタッチ)
    useEffect(() => {
        if (rectRef.current && transformerRef.current) {
            transformerRef.current.nodes([rectRef.current])
            transformerRef.current.getLayer()?.batchDraw()
        }
    }, [session?.targetToken])

    if (!session || !currentAnnotation || !egoPose || !lidarCalibSensor) return null

    // 操作中は凍結値を使い、他ビューへの毎フレーム更新を避ける
    const renderedAnnotation = (isInteractingRef.current && frozenAnnotationRef.current)
        ? frozenAnnotationRef.current
        : currentAnnotation

    // ── BBox 上面のピクセル座標を計算 ──────────────────────────────────────────
    const globalCorners = bboxCornersToGlobal(
        renderedAnnotation.translation,
        renderedAnnotation.rotation,
        renderedAnnotation.size,
    )
    const sensorCorners = globalCorners.map((c) => globalToSensor(c, egoPose, lidarCalibSensor))

    // sensorToBevPixel は Canvas の ctx.translate(0,h);scale(1,-1) で使う座標を返す。
    // Konva はY軸反転なし (screen Y-down) なので y = size - py で変換する。
    const toBevKonva = (sX: number, sY: number): [number, number] => {
        const [px, py] = sensorToBevPixel(sX, sY, viewParams)
        return [px, size - py]
    }

    // 上面: [0]=前右, [1]=前左, [5]=後左, [4]=後右
    const topPx: [number, number][] = [
        toBevKonva(sensorCorners[0][0], sensorCorners[0][1]),  // 前右
        toBevKonva(sensorCorners[1][0], sensorCorners[1][1]),  // 前左
        toBevKonva(sensorCorners[5][0], sensorCorners[5][1]),  // 後左
        toBevKonva(sensorCorners[4][0], sensorCorners[4][1]),  // 後右
    ]

    // 中心ピクセル (4隅の重心)
    const centerX = (topPx[0][0] + topPx[1][0] + topPx[2][0] + topPx[3][0]) / 4
    const centerY = (topPx[0][1] + topPx[1][1] + topPx[2][1] + topPx[3][1]) / 4

    // 画面 yaw: 後面中心 → 前面中心 の方向 (Konva は時計回りが正)
    const frontMidX = (topPx[0][0] + topPx[1][0]) / 2
    const frontMidY = (topPx[0][1] + topPx[1][1]) / 2
    const rearMidX  = (topPx[2][0] + topPx[3][0]) / 2
    const rearMidY  = (topPx[2][1] + topPx[3][1]) / 2
    // Konva Rect の rotation は local Y 軸 (height 方向) の向きで決まる。
    // local Y のスクリーン方向 = (-sin R, cos R)。これが前後ベクトルと一致する R を求める。
    // front-rear ベクトルの角度 = screenYawDeg として、R = screenYawDeg - 90° が正しい回転。
    const screenYawDeg = Math.atan2(frontMidY - rearMidY, frontMidX - rearMidX) * 180 / Math.PI

    // ピクセル単位サイズ
    const widthPx  = renderedAnnotation.size[0] * viewParams.scale
    const lengthPx = renderedAnnotation.size[1] * viewParams.scale

    // ── ドラッグハンドラ (並進) ────────────────────────────────────────────────
    const handleDragStart = (e: Konva.KonvaEventObject<MouseEvent>) => {
        e.cancelBubble = true
        e.evt?.stopPropagation?.()

        isInteractingRef.current    = true
        frozenAnnotationRef.current = currentAnnotation

        startGlobalZRef.current = currentAnnotation.translation[2]
        const startSensor = globalToSensor(currentAnnotation.translation, egoPose, lidarCalibSensor)
        startSensorZRef.current = startSensor[2]
    }

    const handleDragMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
        const node = e.target as Konva.Rect
        // node.x()/node.y() は Konva screen 座標 (Y-down)。bevPixelToSensor は
        // Canvas user-space 座標 (Y-flip 前) を期待するので y を反転する。
        const [sensorX, sensorY] = bevPixelToSensor(node.x(), size - node.y(), viewParams)
        const newGlobal = sensorToGlobal(
            [sensorX, sensorY, startSensorZRef.current],
            egoPose,
            lidarCalibSensor,
        )
        // BEV操作はXY平面のみ。センサー傾きによるZ結合を防ぐため、global Z は固定する。
        updateSessionLive({ translation: [newGlobal[0], newGlobal[1], startGlobalZRef.current] })
    }

    const handleDragEnd = (e: Konva.KonvaEventObject<MouseEvent>) => {
        handleDragMove(e)
        commitChange()
        isInteractingRef.current    = false
        frozenAnnotationRef.current = null
        startGlobalZRef.current     = 0
        startSensorZRef.current     = 0
    }

    // ── Transform ハンドラ (リサイズ・回転) ───────────────────────────────────
    const handleTransformStart = (e: Konva.KonvaEventObject<MouseEvent>) => {
        e.cancelBubble = true
        e.evt?.stopPropagation?.()

        isInteractingRef.current    = true
        frozenAnnotationRef.current = currentAnnotation

        const node = e.target as Konva.Rect
        transformStartScreenYawRef.current  = node.rotation()
        transformStartQuaternionRef.current = [...currentAnnotation.rotation]
        transformStartSizeRef.current       = [...currentAnnotation.size]

        startGlobalZRef.current = currentAnnotation.translation[2]
        const startSensor = globalToSensor(currentAnnotation.translation, egoPose, lidarCalibSensor)
        startSensorZRef.current = startSensor[2]
    }

    const handleTransform = (e: Konva.KonvaEventObject<MouseEvent>) => {
        if (!transformStartQuaternionRef.current || !transformStartSizeRef.current) return

        const node = e.target as Konva.Rect

        // サイズ (px → m、スケール反映)
        const newWidthM  = Math.max(SIZE_MIN, (node.width()  * node.scaleX())  / viewParams.scale)
        const newLengthM = Math.max(SIZE_MIN, (node.height() * node.scaleY()) / viewParams.scale)

        // 回転差分 → グローバル quaternion
        // 画面の時計回り = BEV上の時計回り = グローバル z 軸負方向回転
        const deltaYawRad = (node.rotation() - transformStartScreenYawRef.current) * Math.PI / 180
        const qDelta      = axisAngleToQuaternion([0, 0, 1], -deltaYawRad)
        const newQuaternion = multiplyQuaternions(qDelta, transformStartQuaternionRef.current)

        // 中心 → グローバル translation (Konva screen Y → bevPixelToSensor 用に反転)
        const [sensorX, sensorY] = bevPixelToSensor(node.x(), size - node.y(), viewParams)
        const newGlobalTranslation = sensorToGlobal(
            [sensorX, sensorY, startSensorZRef.current],
            egoPose,
            lidarCalibSensor,
        )

        updateSessionLive({
            // BEV操作はXY平面のみ。センサー傾きによるZ結合を防ぐため、global Z は固定する。
            translation: [newGlobalTranslation[0], newGlobalTranslation[1], startGlobalZRef.current],
            rotation:    newQuaternion,
            size:        [newWidthM, newLengthM, transformStartSizeRef.current[2]],
        })
    }

    const handleTransformEnd = (e: Konva.KonvaEventObject<MouseEvent>) => {
        handleTransform(e)
        commitChange()

        // scale をリセット (新サイズは width/height に直接反映済み)
        const node = e.target as Konva.Rect
        node.scaleX(1)
        node.scaleY(1)

        isInteractingRef.current            = false
        frozenAnnotationRef.current         = null
        transformStartScreenYawRef.current  = 0
        transformStartQuaternionRef.current = null
        transformStartSizeRef.current       = null
        startGlobalZRef.current             = 0
        startSensorZRef.current             = 0
    }

    return (
        <Stage
            width={size}
            height={size}
            style={{ position: 'absolute', top: 0, left: 0 }}
        >
            <Layer>
                <Rect
                    ref={rectRef}
                    x={centerX}
                    y={centerY}
                    width={widthPx}
                    height={lengthPx}
                    offsetX={widthPx / 2}
                    offsetY={lengthPx / 2}
                    rotation={screenYawDeg - 90}
                    stroke='#FF8C00'
                    strokeWidth={2}
                    fill='transparent'
                    draggable={true}
                    onDragStart={handleDragStart}
                    onDragMove={handleDragMove}
                    onDragEnd={handleDragEnd}
                    onTransformStart={handleTransformStart}
                    onTransform={handleTransform}
                    onTransformEnd={handleTransformEnd}
                    onMouseEnter={(e) => {
                        const stage = e.target.getStage()
                        if (stage) stage.container().style.cursor = 'move'
                    }}
                    onMouseLeave={(e) => {
                        const stage = e.target.getStage()
                        if (stage) stage.container().style.cursor = ''
                    }}
                />
                <Transformer
                    ref={transformerRef}
                    rotateEnabled={true}
                    centeredScaling={true}
                    enabledAnchors={[
                        'top-left', 'top-right',
                        'bottom-left', 'bottom-right',
                        'middle-left', 'middle-right',
                        'top-center', 'bottom-center',
                    ]}
                    anchorFill='#FFFFFF'
                    anchorStroke='#FF8C00'
                    anchorSize={8}
                    borderStroke='#FF8C00'
                    borderDash={[4, 4]}
                    keepRatio={false}
                    rotateAnchorOffset={20}
                    boundBoxFunc={(_, newBox) => {
                        const minPx = SIZE_MIN * viewParams.scale
                        if (newBox.width  < minPx) newBox.width  = minPx
                        if (newBox.height < minPx) newBox.height = minPx
                        return newBox
                    }}
                />
            </Layer>
        </Stage>
    )
}
