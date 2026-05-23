import { useMemo } from 'react'
import * as THREE from 'three'
import { Line } from '@react-three/drei'
import { globalToSensor } from '@/lib/coordinateUtils'
import { getBBoxFrontCenter, getBBoxArrowTip } from '@/lib/bboxArrowGeometry'
import type { Annotation } from '@/types/annotation'
import type { EgoPosePoint } from '@/types/sensor'

interface Props {
    ann:              Annotation
    egoPose:          EgoPosePoint
    lidarCalibSensor: { translation: number[]; rotation: number[] }
    color:            string
    lineWidth?:       number
}

/**
 * BBox の前方向矢印を 3D View に描画する.
 * BBox 中心→前面中心の線 + 矢じり (円錐) で構成.
 *
 * 表示座標系: world_X=前=lidar_Y, world_Y=左=-lidar_X, world_Z=上=lidar_Z
 */
export default function BBoxArrow3D({
    ann, egoPose, lidarCalibSensor, color, lineWidth = 2,
}: Props) {
    const { startDisplay, endDisplay, coneQuaternion, coneLength } = useMemo(() => {
        const arrowExtra = Math.min(1.0, ann.size[1] * 0.3)
        const startGlobal = getBBoxFrontCenter(ann.translation, ann.rotation, ann.size)
        const endGlobal   = getBBoxArrowTip(ann.translation, ann.rotation, ann.size, arrowExtra)

        const globalToDisplay = (g: [number, number, number]): [number, number, number] => {
            const s = globalToSensor(g, egoPose, lidarCalibSensor)
            return [s[1], -s[0], s[2]]
        }
        const startDisplay = globalToDisplay(startGlobal)
        const endDisplay   = globalToDisplay(endGlobal)

        // 矢じり (cone) の長さ
        const coneLen = Math.min(0.4, arrowExtra * 0.5)

        // 矢じりの向き: 始点 → 終点 方向
        const dir = new THREE.Vector3(
            endDisplay[0] - startDisplay[0],
            endDisplay[1] - startDisplay[1],
            endDisplay[2] - startDisplay[2],
        ).normalize()
        // coneGeometry のデフォルト軸 (Y+) を dir に向ける回転
        const coneQ = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0), dir,
        )

        return {
            startDisplay, endDisplay,
            coneQuaternion: coneQ,
            coneLength:     coneLen,
        }
    }, [ann, egoPose, lidarCalibSensor])

    return (
        <group>
            {/* 線分 */}
            <Line
                points={[startDisplay, endDisplay]}
                color={color}
                lineWidth={lineWidth}
            />
            {/* 矢じり (cone) */}
            <mesh position={endDisplay} quaternion={coneQuaternion}>
                <coneGeometry args={[coneLength * 0.4, coneLength, 8]} />
                <meshBasicMaterial color={color} />
            </mesh>
        </group>
    )
}
