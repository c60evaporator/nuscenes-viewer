import { useEffect, useRef, useMemo } from 'react'
import * as THREE from 'three'
import { Line, TransformControls } from '@react-three/drei'
import { useEditStore } from '@/store/editStore'
import {
    bboxCornersToGlobal, globalToSensor,
    multiplyQuaternions, quaternionConjugate,
    sensorOffsetToGlobalOffset,
    Q_SENSOR_TO_VIEW, Q_VIEW_TO_SENSOR,
} from '@/lib/coordinateUtils'
import type { Annotation } from '@/types/annotation'
import type { EgoPosePoint } from '@/types/sensor'

interface Props {
    ann:              Annotation
    egoPose:          EgoPosePoint
    lidarCalibSensor: { translation: number[]; rotation: number[] }
    transformMode:    'translate' | 'rotate'
    orbitControlsRef: React.RefObject<any>
}

export default function EditingBBox3D({
    ann, egoPose, lidarCalibSensor, transformMode, orbitControlsRef,
}: Props) {
    const meshRef              = useRef<THREE.Mesh>(null)
    const transformControlsRef = useRef<any>(null)

    const updateSessionLive = useEditStore((s) => s.updateSessionLive)
    const commitChange      = useEditStore((s) => s.commitChange)

    const isDraggingRef           = useRef(false)
    const dragStartViewPosRef     = useRef<THREE.Vector3 | null>(null)
    const dragStartViewQuatRef    = useRef<THREE.Quaternion | null>(null)
    const dragStartTranslationRef = useRef<number[] | null>(null)
    const dragStartRotationRef    = useRef<number[] | null>(null)

    const { displayCenter, displaySize, displayQuaternion, edgePoints } = useMemo(() => {
        const globalCorners  = bboxCornersToGlobal(ann.translation, ann.rotation, ann.size)
        const sensorCorners  = globalCorners.map((c) => globalToSensor(c, egoPose, lidarCalibSensor))
        const displayCorners = sensorCorners.map((c) => [c[1], -c[0], c[2]])

        const center: [number, number, number] = [
            displayCorners.reduce((s, c) => s + c[0], 0) / 8,
            displayCorners.reduce((s, c) => s + c[1], 0) / 8,
            displayCorners.reduce((s, c) => s + c[2], 0) / 8,
        ]

        // BBox の表示座標系 quaternion: sandwich formula
        // q_display = Q_S2V * q_sensor * Q_V2S
        const q_egoInv   = quaternionConjugate(egoPose.rotation)
        const q_calibInv = quaternionConjugate(lidarCalibSensor.rotation)
        const q_sensor   = multiplyQuaternions(q_calibInv, multiplyQuaternions(q_egoInv, ann.rotation))
        const q_disp     = multiplyQuaternions(
            multiplyQuaternions(Q_SENSOR_TO_VIEW, q_sensor),
            Q_VIEW_TO_SENSOR,
        )
        // nuScenes [w,x,y,z] → Three.js Quaternion(x,y,z,w)
        const displayQuat = new THREE.Quaternion(q_disp[1], q_disp[2], q_disp[3], q_disp[0])

        const edges: [number, number][] = [
            [0, 1], [1, 5], [5, 4], [4, 0],
            [2, 3], [3, 7], [7, 6], [6, 2],
            [0, 3], [1, 2], [4, 7], [5, 6],
        ]
        const pts: [number, number, number][] = []
        edges.forEach(([a, b]) => {
            pts.push([displayCorners[a][0], displayCorners[a][1], displayCorners[a][2]])
            pts.push([displayCorners[b][0], displayCorners[b][1], displayCorners[b][2]])
        })

        return {
            displayCenter:     center,
            displaySize:       [ann.size[0], ann.size[1], ann.size[2]] as [number, number, number],
            displayQuaternion: displayQuat,
            edgePoints:        pts,
        }
    }, [ann, egoPose, lidarCalibSensor])

    // ドラッグ中以外は annotation の変化を mesh に反映する
    useEffect(() => {
        if (isDraggingRef.current) return
        const mesh = meshRef.current
        if (!mesh) return
        mesh.position.set(displayCenter[0], displayCenter[1], displayCenter[2])
        mesh.quaternion.copy(displayQuaternion)
    }, [displayCenter, displayQuaternion])

    // dragging-changed: OrbitControls の有効/無効を切り替える
    useEffect(() => {
        const tc = transformControlsRef.current
        const oc = orbitControlsRef.current
        if (!tc || !oc) return
        const onDraggingChanged = (e: any) => { oc.enabled = !e.value }
        tc.addEventListener('dragging-changed', onDraggingChanged)
        return () => tc.removeEventListener('dragging-changed', onDraggingChanged)
    })

    const handleMouseDown = () => {
        const mesh = meshRef.current
        if (!mesh) return
        isDraggingRef.current           = true
        dragStartViewPosRef.current     = mesh.position.clone()
        dragStartViewQuatRef.current    = mesh.quaternion.clone()
        dragStartTranslationRef.current = [...ann.translation]
        dragStartRotationRef.current    = [...ann.rotation]
    }

    const handleChange = () => {
        const mesh         = meshRef.current
        const startPos     = dragStartViewPosRef.current
        const startQuat    = dragStartViewQuatRef.current
        const startTrans   = dragStartTranslationRef.current
        const startRot     = dragStartRotationRef.current
        if (!mesh || !startPos || !startQuat || !startTrans || !startRot) return

        // ── 並進差分: 表示座標 → センサー座標 → グローバル座標 ──
        const dx_v = mesh.position.x - startPos.x
        const dy_v = mesh.position.y - startPos.y
        const dz_v = mesh.position.z - startPos.z
        // display (x,y,z) → sensor: (-y, +x, +z)
        const sensorOff   = [-dy_v, +dx_v, +dz_v]
        const globalOff   = sensorOffsetToGlobalOffset(sensorOff, egoPose, lidarCalibSensor)
        const newTranslation = [
            startTrans[0] + globalOff[0],
            startTrans[1] + globalOff[1],
            startTrans[2] + globalOff[2],
        ]

        // ── 回転差分: 表示座標 → センサー座標 → グローバル座標 ──
        // q_delta_view (Three.js) = mesh.quaternion * startQuat.invert()
        const qDeltaThree = mesh.quaternion.clone().multiply(startQuat.clone().invert())
        // Three.js [x,y,z,w] → nuScenes [w,x,y,z]
        const qDelta_v = [qDeltaThree.w, qDeltaThree.x, qDeltaThree.y, qDeltaThree.z]
        // display → sensor: q_delta_s = Q_V2S * q_delta_v * Q_S2V
        const qDelta_s = multiplyQuaternions(
            multiplyQuaternions(Q_VIEW_TO_SENSOR, qDelta_v),
            Q_SENSOR_TO_VIEW,
        )
        // sensor → global: R_ego * R_calib * q_delta_s * R_calib^-1 * R_ego^-1
        const q_calibInv    = quaternionConjugate(lidarCalibSensor.rotation)
        const q_egoInv      = quaternionConjugate(egoPose.rotation)
        const u1            = multiplyQuaternions(lidarCalibSensor.rotation, qDelta_s)
        const u2            = multiplyQuaternions(u1, q_calibInv)
        const u3            = multiplyQuaternions(egoPose.rotation, u2)
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
            {/* オレンジワイヤーフレーム（editStore 経由でリアルタイム更新） */}
            <Line points={edgePoints} color='#FF8C00' lineWidth={2} segments />

            {/* TransformControls のターゲット mesh（透明） */}
            <mesh ref={meshRef}>
                <boxGeometry args={displaySize} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>

            {/* TransformControls（mesh ref を object prop で指定） */}
            <TransformControls
                ref={transformControlsRef}
                object={meshRef}
                mode={transformMode}
                space='world'
                onMouseDown={handleMouseDown}
                onChange={handleChange}
                onMouseUp={handleMouseUp}
            />
        </>
    )
}
