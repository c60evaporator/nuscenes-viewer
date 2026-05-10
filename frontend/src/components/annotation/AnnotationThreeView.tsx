import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { usePointCloud } from '@/api/sensorData'
import { useEditStore } from '@/store/editStore'
import { bboxCornersToGlobal, globalToSensor } from '@/lib/coordinateUtils'
import type { Annotation } from '@/types/annotation'
import type { EgoPosePoint } from '@/types/sensor'

interface Props {
    sampleDataToken:  string
    annotations:      Annotation[]
    egoPose:          EgoPosePoint | undefined
    lidarCalibSensor: { translation: number[]; rotation: number[] } | undefined
    highlightInstanceToken?: string
    editingInstanceToken?:   string
    onBBoxClick?: (annToken: string) => void
}

export default function AnnotationThreeView({
    sampleDataToken,
    annotations,
    egoPose,
    lidarCalibSensor,
    highlightInstanceToken,
    editingInstanceToken,
    onBBoxClick,
}: Props) {
    const { data: pointCloud, isLoading } = usePointCloud(sampleDataToken)
    const currentAnnotation = useEditStore((s) => s.getCurrentAnnotation())

    const effectiveAnnotations = useMemo(() => {
        if (!currentAnnotation) return annotations
        return annotations.map((a) =>
            a.token === currentAnnotation.token ? currentAnnotation : a
        )
    }, [annotations, currentAnnotation])

    if (isLoading || !pointCloud) {
        return (
            <div style={{
                width: '100%', height: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: '#111', color: '#888', fontSize: 12,
            }}>
                Loading 3D view...
            </div>
        )
    }

    return (
        <div style={{ width: '100%', height: '100%', background: '#111' }}>
            <Canvas
                camera={{
                    up:       [0, 0, 1],
                    position: [-20, -20, 30],
                    fov:      50,
                    near:     0.1,
                    far:      1000,
                }}
            >
                {/* 座標軸: X=赤, Y=緑, Z=青、長さ10m */}
                <axesHelper args={[10]} />

                {/* グリッド (XY平面, 5m間隔 = 100m / 20分割) */}
                <gridHelper
                    args={[100, 20, '#555', '#333']}
                    rotation={[Math.PI / 2, 0, 0]}
                />

                {/* 点群 */}
                <PointCloudMesh points={pointCloud.points} />

                {/* BBox群 */}
                {egoPose && lidarCalibSensor && effectiveAnnotations.map((ann) => (
                    <BBoxMesh
                        key={ann.token}
                        ann={ann}
                        egoPose={egoPose}
                        lidarCalibSensor={lidarCalibSensor}
                        color={
                            ann.instance_token === editingInstanceToken  ? '#FF8C00'
                            : ann.instance_token === highlightInstanceToken ? '#FFD700'
                            : '#00FF88'
                        }
                        onClick={onBBoxClick}
                    />
                ))}

                <OrbitControls
                    enableDamping={false}
                    enablePan={true}
                    enableZoom={true}
                    enableRotate={true}
                    target={[0, 0, 0]}
                />
            </Canvas>
        </div>
    )
}

function PointCloudMesh({ points }: { points: number[][] }) {
    const { positions, colors } = useMemo(() => {
        const N = points.length
        const positions = new Float32Array(N * 3)
        const colors    = new Float32Array(N * 3)

        for (let i = 0; i < N; i++) {
            const [x, y, z, intensity] = points[i]
            // LIDAR_TOP → Ego: world_X=前=lidar_Y, world_Y=左=-lidar_X, world_Z=上=lidar_Z
            positions[i * 3]     = y
            positions[i * 3 + 1] = -x
            positions[i * 3 + 2] = z

            const normalized = Math.min((intensity ?? 0) / 255, 1)
            colors[i * 3]     = (normalized * 200) / 255
            colors[i * 3 + 1] = (100 + normalized * 155) / 255
            colors[i * 3 + 2] = (200 + normalized * 55)  / 255
        }
        return { positions, colors }
    }, [points])

    return (
        <points>
            <bufferGeometry>
                <bufferAttribute
                    attach='attributes-position'
                    args={[positions, 3]}
                />
                <bufferAttribute
                    attach='attributes-color'
                    args={[colors, 3]}
                />
            </bufferGeometry>
            <pointsMaterial size={0.08} vertexColors sizeAttenuation />
        </points>
    )
}

function BBoxMesh({
    ann, egoPose, lidarCalibSensor, color, onClick,
}: {
    ann:              Annotation
    egoPose:          EgoPosePoint
    lidarCalibSensor: { translation: number[]; rotation: number[] }
    color:            string
    onClick?:         (annToken: string) => void
}) {
    const { lineVertices, aabbCenter, aabbSize } = useMemo(() => {
        // 8隅をセンサー座標系で計算
        const globalCorners = bboxCornersToGlobal(ann.translation, ann.rotation, ann.size)
        const sensorCorners = globalCorners.map((c) => globalToSensor(c, egoPose, lidarCalibSensor))

        // LIDAR_TOP → Ego: world_X=前=lidar_Y, world_Y=左=-lidar_X, world_Z=上=lidar_Z
        const displayCorners = sensorCorners.map((c) => [c[1], -c[0], c[2]])

        // 12辺のインデックスペア
        // 0:前右上, 1:前左上, 2:前左下, 3:前右下
        // 4:後右上, 5:後左上, 6:後左下, 7:後右下
        const edges: [number, number][] = [
            [0, 1], [1, 5], [5, 4], [4, 0],   // 上面
            [2, 3], [3, 7], [7, 6], [6, 2],   // 下面
            [0, 3], [1, 2], [4, 7], [5, 6],   // 縦辺
        ]
        const lineVertices = new Float32Array(edges.length * 6)
        edges.forEach(([a, b], i) => {
            lineVertices[i * 6]     = displayCorners[a][0]
            lineVertices[i * 6 + 1] = displayCorners[a][1]
            lineVertices[i * 6 + 2] = displayCorners[a][2]
            lineVertices[i * 6 + 3] = displayCorners[b][0]
            lineVertices[i * 6 + 4] = displayCorners[b][1]
            lineVertices[i * 6 + 5] = displayCorners[b][2]
        })

        // クリック判定用 AABB (軸並行bounding box)
        const xs = displayCorners.map((c) => c[0])
        const ys = displayCorners.map((c) => c[1])
        const zs = displayCorners.map((c) => c[2])
        const minX = Math.min(...xs), maxX = Math.max(...xs)
        const minY = Math.min(...ys), maxY = Math.max(...ys)
        const minZ = Math.min(...zs), maxZ = Math.max(...zs)
        const aabbCenter: [number, number, number] = [
            (minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2,
        ]
        const aabbSize: [number, number, number] = [
            Math.max(maxX - minX, 0.1),
            Math.max(maxY - minY, 0.1),
            Math.max(maxZ - minZ, 0.1),
        ]

        return { lineVertices, aabbCenter, aabbSize }
    }, [ann, egoPose, lidarCalibSensor])

    return (
        <group>
            {/* ワイヤーフレーム */}
            <lineSegments>
                <bufferGeometry>
                    <bufferAttribute
                        attach='attributes-position'
                        args={[lineVertices, 3]}
                    />
                </bufferGeometry>
                <lineBasicMaterial color={color} />
            </lineSegments>

            {/* クリック判定用 (透明) */}
            {onClick && (
                <mesh
                    position={aabbCenter}
                    onClick={(e) => {
                        e.stopPropagation()
                        onClick(ann.token)
                    }}
                >
                    <boxGeometry args={aabbSize} />
                    <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                </mesh>
            )}
        </group>
    )
}
