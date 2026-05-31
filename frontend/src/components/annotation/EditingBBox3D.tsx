import { useEffect, useRef, useLayoutEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Line, TransformControls } from '@react-three/drei'
import { useEditStore } from '@/store/editStore'
import {
    bboxCornersToGlobal, globalToSensor,
    multiplyQuaternions, quaternionConjugate,
    sensorOffsetToGlobalOffset,
    Q_SENSOR_TO_VIEW, Q_VIEW_TO_SENSOR,
} from '@/lib/coordinateUtils'
import { getBBoxFrontCenter, getBBoxArrowTip } from '@/lib/bboxArrowGeometry'
import type { Annotation } from '@/types/annotation'
import type { EgoPosePoint } from '@/types/sensor'

interface OrbitControlsLike {
    enabled: boolean
    target:  { set: (x: number, y: number, z: number) => void }
    update:  () => void
}
interface TransformControlsLike {
    addEventListener(type: string, cb: (e: { value: boolean }) => void): void
    removeEventListener(type: string, cb: (e: { value: boolean }) => void): void
}
interface Line2Like {
    geometry: { setPositions: (pos: ArrayLike<number>) => void } | null
}

interface Props {
    ann:              Annotation
    egoPose:          EgoPosePoint
    lidarCalibSensor: { translation: number[]; rotation: number[] }
    transformMode:    'translate' | 'rotate'
    orbitControlsRef: React.RefObject<OrbitControlsLike | null>
}

const BBOX_EDGES: [number, number][] = [
    [0, 1], [1, 5], [5, 4], [4, 0],
    [2, 3], [3, 7], [7, 6], [6, 2],
    [0, 3], [1, 2], [4, 7], [5, 6],
]

function computeDisplay(
    ann: Annotation,
    egoPose: EgoPosePoint,
    lidarCalibSensor: { translation: number[]; rotation: number[] },
): {
    displayCenter:     [number, number, number]
    displayQuaternion: THREE.Quaternion
    edgePoints:        [number, number, number][]
} {
    const globalCorners  = bboxCornersToGlobal(ann.translation, ann.rotation, ann.size)
    const sensorCorners  = globalCorners.map((c) => globalToSensor(c, egoPose, lidarCalibSensor))
    const displayCorners = sensorCorners.map((c) => [c[1], -c[0], c[2]] as [number, number, number])

    const center: [number, number, number] = [
        displayCorners.reduce((s, c) => s + c[0], 0) / 8,
        displayCorners.reduce((s, c) => s + c[1], 0) / 8,
        displayCorners.reduce((s, c) => s + c[2], 0) / 8,
    ]

    const q_egoInv   = quaternionConjugate(egoPose.rotation)
    const q_calibInv = quaternionConjugate(lidarCalibSensor.rotation)
    const q_sensor   = multiplyQuaternions(q_calibInv, multiplyQuaternions(q_egoInv, ann.rotation))
    const q_disp     = multiplyQuaternions(
        multiplyQuaternions(Q_SENSOR_TO_VIEW, q_sensor),
        Q_VIEW_TO_SENSOR,
    )
    const displayQuat = new THREE.Quaternion(q_disp[1], q_disp[2], q_disp[3], q_disp[0])

    const edgePoints: [number, number, number][] = []
    BBOX_EDGES.forEach(([a, b]) => {
        edgePoints.push(displayCorners[a])
        edgePoints.push(displayCorners[b])
    })

    return { displayCenter: center, displayQuaternion: displayQuat, edgePoints }
}

function computeArrow(
    ann: Annotation,
    egoPose: EgoPosePoint,
    lidarCalibSensor: { translation: number[]; rotation: number[] },
): {
    startDisplay:    [number, number, number]
    endDisplay:      [number, number, number]
    coneQuaternion:  THREE.Quaternion
    coneLength:      number
} {
    const arrowExtra = Math.min(1.0, ann.size[1] * 0.3)
    const startGlobal = getBBoxFrontCenter(ann.translation, ann.rotation, ann.size)
    const endGlobal   = getBBoxArrowTip(ann.translation, ann.rotation, ann.size, arrowExtra)

    const globalToDisplay = (g: [number, number, number]): [number, number, number] => {
        const s = globalToSensor(g, egoPose, lidarCalibSensor)
        return [s[1], -s[0], s[2]]
    }
    const startDisplay = globalToDisplay(startGlobal)
    const endDisplay   = globalToDisplay(endGlobal)

    const coneLen = Math.min(0.4, arrowExtra * 0.5)
    const dir = new THREE.Vector3(
        endDisplay[0] - startDisplay[0],
        endDisplay[1] - startDisplay[1],
        endDisplay[2] - startDisplay[2],
    ).normalize()
    const coneQ = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0), dir,
    )

    return {
        startDisplay, endDisplay,
        coneQuaternion: coneQ,
        coneLength:     coneLen,
    }
}

export default function EditingBBox3D({
    ann, egoPose, lidarCalibSensor, transformMode, orbitControlsRef,
}: Props) {
    const meshRef              = useRef<THREE.Mesh>(null)
    const lineRef              = useRef<Line2Like | null>(null)
    const transformControlsRef = useRef<TransformControlsLike | null>(null)

    const updateSessionLive = useEditStore((s) => s.updateSessionLive)
    const commitChange      = useEditStore((s) => s.commitChange)

    const isDraggingRef           = useRef(false)
    const dragStartViewPosRef     = useRef<THREE.Vector3 | null>(null)
    const dragStartViewQuatRef    = useRef<THREE.Quaternion | null>(null)
    const dragStartTranslationRef = useRef<number[] | null>(null)
    const dragStartRotationRef    = useRef<number[] | null>(null)

    // 矢印用 refs
    const arrowLineRef = useRef<Line2Like | null>(null)
    const arrowConeRef = useRef<THREE.Mesh>(null)

    // props を ref で保持 (useFrame からアクセスするため)
    const egoPoseRef = useRef(egoPose)
    const lidarCalibSensorRef = useRef(lidarCalibSensor)
    useLayoutEffect(() => {
        egoPoseRef.current         = egoPose
        lidarCalibSensorRef.current = lidarCalibSensor
    })

    // 初期表示用（JSX の初期値として渡す）
    const initial = computeDisplay(ann, egoPose, lidarCalibSensor)
    const initialArrow = computeArrow(ann, egoPose, lidarCalibSensor)

    // ── useFrame: React Scheduler を介さず毎フレーム直接更新 ──
    useFrame(() => {
        const annNow = useEditStore.getState().getCurrentAnnotation()
        if (!annNow) return
        const ego   = egoPoseRef.current
        const calib = lidarCalibSensorRef.current

        const { displayCenter, displayQuaternion, edgePoints } = computeDisplay(annNow, ego, calib)

        // ワイヤーフレーム更新（drei Line2 の geometry.setPositions）
        const lineObj = lineRef.current
        if (lineObj?.geometry && typeof lineObj.geometry.setPositions === 'function') {
            const flat = new Float32Array(edgePoints.length * 3)
            for (let i = 0; i < edgePoints.length; i++) {
                flat[i * 3]     = edgePoints[i][0]
                flat[i * 3 + 1] = edgePoints[i][1]
                flat[i * 3 + 2] = edgePoints[i][2]
            }
            lineObj.geometry.setPositions(flat)
        }

        // 透明 mesh 更新（ドラッグ中は TransformControls が制御するためスキップ）
        if (!isDraggingRef.current && meshRef.current) {
            meshRef.current.position.set(displayCenter[0], displayCenter[1], displayCenter[2])
            meshRef.current.quaternion.copy(displayQuaternion)
        }

        // 矢印更新
        const arrow = computeArrow(annNow, ego, calib)
        const arrowLine = arrowLineRef.current
        if (arrowLine?.geometry && typeof arrowLine.geometry.setPositions === 'function') {
            const flat = new Float32Array([
                arrow.startDisplay[0], arrow.startDisplay[1], arrow.startDisplay[2],
                arrow.endDisplay[0],   arrow.endDisplay[1],   arrow.endDisplay[2],
            ])
            arrowLine.geometry.setPositions(flat)
        }
        if (arrowConeRef.current) {
            arrowConeRef.current.position.set(arrow.endDisplay[0], arrow.endDisplay[1], arrow.endDisplay[2])
            arrowConeRef.current.quaternion.copy(arrow.coneQuaternion)
        }
    })

    // dragging-changed: OrbitControls の有効/無効を切り替える
    useEffect(() => {
        const tc = transformControlsRef.current
        const oc = orbitControlsRef.current
        if (!tc || !oc) return
        const onDraggingChanged = (e: { value: boolean }) => { oc.enabled = !e.value }
        tc.addEventListener('dragging-changed', onDraggingChanged)
        return () => tc.removeEventListener('dragging-changed', onDraggingChanged)
    })

    const handleMouseDown = () => {
        const mesh   = meshRef.current
        const annNow = useEditStore.getState().getCurrentAnnotation()
        if (!mesh || !annNow) return
        isDraggingRef.current           = true
        dragStartViewPosRef.current     = mesh.position.clone()
        dragStartViewQuatRef.current    = mesh.quaternion.clone()
        dragStartTranslationRef.current = [...annNow.translation]
        dragStartRotationRef.current    = [...annNow.rotation]
    }

    const handleChange = () => {
        const mesh       = meshRef.current
        const startPos   = dragStartViewPosRef.current
        const startQuat  = dragStartViewQuatRef.current
        const startTrans = dragStartTranslationRef.current
        const startRot   = dragStartRotationRef.current
        const ego        = egoPoseRef.current
        const calib      = lidarCalibSensorRef.current
        if (!mesh || !startPos || !startQuat || !startTrans || !startRot) return

        // ── 並進差分: 表示座標 → センサー座標 → グローバル座標 ──
        const dx_v = mesh.position.x - startPos.x
        const dy_v = mesh.position.y - startPos.y
        const dz_v = mesh.position.z - startPos.z
        const sensorOff   = [-dy_v, +dx_v, +dz_v]
        const globalOff   = sensorOffsetToGlobalOffset(sensorOff, ego, calib)
        const newTranslation = [
            startTrans[0] + globalOff[0],
            startTrans[1] + globalOff[1],
            startTrans[2] + globalOff[2],
        ]

        // ── 回転差分: 表示座標 → センサー座標 → グローバル座標 ──
        const qDeltaThree = mesh.quaternion.clone().multiply(startQuat.clone().invert())
        const qDelta_v = [qDeltaThree.w, qDeltaThree.x, qDeltaThree.y, qDeltaThree.z]
        const qDelta_s = multiplyQuaternions(
            multiplyQuaternions(Q_VIEW_TO_SENSOR, qDelta_v),
            Q_SENSOR_TO_VIEW,
        )
        const q_calibInv    = quaternionConjugate(calib.rotation)
        const q_egoInv      = quaternionConjugate(ego.rotation)
        const u1            = multiplyQuaternions(calib.rotation, qDelta_s)
        const u2            = multiplyQuaternions(u1, q_calibInv)
        const u3            = multiplyQuaternions(ego.rotation, u2)
        const qDelta_global = multiplyQuaternions(u3, q_egoInv)
        const newRotation   = multiplyQuaternions(qDelta_global, startRot)

        updateSessionLive({ translation: newTranslation, rotation: newRotation })
    }

    const handleMouseUp = () => {
        isDraggingRef.current           = false
        dragStartViewPosRef.current     = null
        dragStartViewQuatRef.current    = null
        dragStartTranslationRef.current = null
        dragStartRotationRef.current    = null
        commitChange()
    }

    return (
        <>
            {/* オレンジワイヤーフレーム（useFrame で直接更新） */}
            <Line
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ref={lineRef as React.MutableRefObject<any>}
                points={initial.edgePoints}
                color='#FF8C00'
                lineWidth={2}
                segments
            />

            {/* 矢印: 線 */}
            <Line
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ref={arrowLineRef as React.MutableRefObject<any>}
                points={[initialArrow.startDisplay, initialArrow.endDisplay]}
                color='#FF8C00'
                lineWidth={3}
            />
            {/* 矢印: 矢じり (cone) */}
            <mesh
                ref={arrowConeRef}
                position={initialArrow.endDisplay}
                quaternion={initialArrow.coneQuaternion}
            >
                <coneGeometry args={[initialArrow.coneLength * 0.4, initialArrow.coneLength, 8]} />
                <meshBasicMaterial color='#FF8C00' />
            </mesh>

            {/* TransformControls のターゲット mesh（透明、position/quaternion は useFrame が管理） */}
            <mesh ref={meshRef}>
                <boxGeometry args={[ann.size[0], ann.size[1], ann.size[2]]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>

            {/* TransformControls */}
            <TransformControls
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ref={transformControlsRef as React.MutableRefObject<any>}
                object={meshRef as React.RefObject<THREE.Object3D>}
                mode={transformMode}
                space='local'
                onMouseDown={handleMouseDown}
                onChange={handleChange}
                onMouseUp={handleMouseUp}
            />
        </>
    )
}
