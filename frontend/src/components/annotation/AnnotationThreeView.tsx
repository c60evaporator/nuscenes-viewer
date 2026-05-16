import { useState, useRef, useEffect, useMemo, memo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Line } from '@react-three/drei'
import { usePointCloud } from '@/api/sensorData'
import { useEditStore } from '@/store/editStore'
import { bboxCornersToGlobal, globalToSensor } from '@/lib/coordinateUtils'
import EditingBBox3D from '@/components/annotation/EditingBBox3D'
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

const FORM_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

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
    const session           = useEditStore((s) => s.session)
    const currentAnnotation = useEditStore((s) => s.getCurrentAnnotation())

    const [transformMode, setTransformMode] = useState<'translate' | 'rotate'>('translate')
    const orbitControlsRef = useRef<any>(null)
    const mouseInsideRef   = useRef(false)

    // 編集中以外の通常 BBox
    const normalAnnotations = useMemo(() => {
        if (!currentAnnotation) return annotations
        return annotations.filter((a) => a.token !== currentAnnotation.token)
    }, [annotations, currentAnnotation])

    // W/E キー: TransformControls モード切替（3D ビューにマウスがある時のみ）
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (!mouseInsideRef.current) return
            if (FORM_TAGS.has((e.target as HTMLElement).tagName)) return
            if (!session) return
            if (e.key === 'w' || e.key === 'W') {
                e.preventDefault()
                setTransformMode('translate')
            } else if (e.key === 'e' || e.key === 'E') {
                e.preventDefault()
                setTransformMode('rotate')
            }
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [session])

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
        <div
            style={{ width: '100%', height: '100%', background: '#111' }}
            onMouseEnter={() => { mouseInsideRef.current = true }}
            onMouseLeave={() => { mouseInsideRef.current = false }}
        >
            <Canvas
                camera={{
                    up:       [0, 0, 1],
                    position: [-20, -20, 30],
                    fov:      50,
                    near:     0.1,
                    far:      1000,
                }}
            >
                {/* 座標軸: X=赤(前), Y=緑(左), Z=青(上)、長さ10m */}
                <Line points={[[0,0,0],[10,0,0]]} color='red'   lineWidth={1} />
                <Line points={[[0,0,0],[0,10,0]]} color='green' lineWidth={1} />
                <Line points={[[0,0,0],[0,0,10]]} color='blue'  lineWidth={1} />

                {/* グリッド (XY平面, 5m間隔 = 100m / 20分割) */}
                <gridHelper
                    args={[100, 20, '#555', '#333']}
                    rotation={[Math.PI / 2, 0, 0]}
                />

                {/* 点群 */}
                <PointCloudMesh points={pointCloud.points} />

                {/* 通常 BBox（編集中を除く） */}
                {egoPose && lidarCalibSensor && normalAnnotations.map((ann) => (
                    <NormalBBoxMesh
                        key={ann.token}
                        ann={ann}
                        egoPose={egoPose}
                        lidarCalibSensor={lidarCalibSensor}
                        color={
                            ann.instance_token === editingInstanceToken  ? '#FF8C00'
                            : ann.instance_token === highlightInstanceToken ? '#FFD700'
                            : '#00FF88'
                        }
                        lineWidth={ann.instance_token === editingInstanceToken ? 2 : 1.5}
                        onClick={onBBoxClick}
                    />
                ))}

                {/* 編集中 BBox（TransformControls 付き） */}
                {currentAnnotation && egoPose && lidarCalibSensor && (
                    <EditingBBox3D
                        ann={currentAnnotation}
                        egoPose={egoPose}
                        lidarCalibSensor={lidarCalibSensor}
                        transformMode={transformMode}
                        orbitControlsRef={orbitControlsRef}
                    />
                )}

                <OrbitControls
                    ref={orbitControlsRef}
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

const NormalBBoxMesh = memo(function NormalBBoxMesh({
    ann, egoPose, lidarCalibSensor, color, lineWidth, onClick,
}: {
    ann:              Annotation
    egoPose:          EgoPosePoint
    lidarCalibSensor: { translation: number[]; rotation: number[] }
    color:            string
    lineWidth:        number
    onClick?:         (annToken: string) => void
}) {
    const { edgePoints, aabbCenter, aabbSize } = useMemo(() => {
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
        const edgePoints: [number, number, number][] = []
        edges.forEach(([a, b]) => {
            edgePoints.push([displayCorners[a][0], displayCorners[a][1], displayCorners[a][2]])
            edgePoints.push([displayCorners[b][0], displayCorners[b][1], displayCorners[b][2]])
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

        return { edgePoints, aabbCenter, aabbSize }
    }, [ann, egoPose, lidarCalibSensor])

    return (
        <group>
            {/* ワイヤーフレーム (drei Line で太さ指定) */}
            <Line points={edgePoints} color={color} lineWidth={lineWidth} segments />

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
},
// onClick は毎レンダリングで参照が変わるが動作は同一なので比較から除外する
(prev, next) =>
    prev.ann              === next.ann              &&
    prev.egoPose          === next.egoPose          &&
    prev.lidarCalibSensor === next.lidarCalibSensor &&
    prev.color            === next.color            &&
    prev.lineWidth        === next.lineWidth
)
