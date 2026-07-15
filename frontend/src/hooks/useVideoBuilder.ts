/**
 * 動画生成オーケストレーション
 *
 * 1. prefetch フェーズ: シーン一括 sensor-data + 全フレームの画像・点群・annotations を
 *    TanStack Query fetchQuery（並列数 6）で先読みしローカル Map に保持する
 * 2. recording フェーズ: MediaRecorder（videoEncoder）で 1 フレームずつ
 *    drawVideoFrame（videoFrame）を描画・キャプチャして WebM Blob を生成する
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { sceneSensorDataQueryOptions } from '@/api/scenes'
import { videoSensorImageQueryOptions, pointCloudQueryOptions } from '@/api/sensorData'
import { sampleAnnotationsQueryOptions } from '@/api/samples'
import { basemapQueryOptions } from '@/api/maps'
import {
  computeVideoLayout,
  drawVideoFrame,
  type ChannelFrameData,
  type VideoFrameContext,
  type VideoFrameData,
} from '@/lib/videoFrame'
import { createMediaRecorderEncoder, pickSupportedWebmMimeType } from '@/lib/videoEncoder'
import type { Annotation } from '@/types/annotation'
import type { CalibratedSensor, EgoPosePoint, PointCloud, SensorDataMap } from '@/types/sensor'
import type { Sample } from '@/types/scene'

export interface VideoBuildInput {
  sceneToken:     string
  samples:        Sample[]       // timestamp 昇順
  channels:       string[]       // 選択センサー（EGO_POSE 含む）
  fps:            number
  maxImageSize?:  number         // カメラ画像の縮小サイズ（デフォルト 640）
  calibSensorMap: Record<string, CalibratedSensor>
  egoPoses:       EgoPosePoint[]
  location:       string | null
}

export interface VideoBuildState {
  phase:     'idle' | 'prefetch' | 'recording' | 'done' | 'error'
  completed: number
  total:     number
  videoUrl:  string | null
  mimeType:  string | null
  error:     string | null
}

const INITIAL_STATE: VideoBuildState = {
  phase: 'idle', completed: 0, total: 0, videoUrl: null, mimeType: null, error: null,
}

/** prefetch タスクを並列数 concurrency で実行する（各タスクは自前でエラー処理する） */
async function runPool(
  tasks:       (() => Promise<void>)[],
  concurrency: number,
  isCancelled: () => boolean,
): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < tasks.length && !isCancelled()) {
      const i = next++
      await tasks[i]()
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, worker),
  )
}

export function useVideoBuilder(canvasRef: RefObject<HTMLCanvasElement | null>) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<VideoBuildState>(INITIAL_STATE)
  const cancelledRef = useRef(false)
  const encoderRef   = useRef<ReturnType<typeof createMediaRecorderEncoder> | null>(null)
  const bitmapsRef   = useRef<ImageBitmap[]>([])   // 録画後に close する縮小画像
  const videoUrlRef  = useRef<string | null>(null)
  const runningRef   = useRef(false)

  const releaseResources = useCallback(() => {
    if (videoUrlRef.current) {
      URL.revokeObjectURL(videoUrlRef.current)
      videoUrlRef.current = null
    }
    for (const bmp of bitmapsRef.current) bmp.close()
    bitmapsRef.current = []
    queryClient.removeQueries({ queryKey: ['sensor-image-video'] })
  }, [queryClient])

  const reset = useCallback(() => {
    cancelledRef.current = true
    encoderRef.current?.abort()
    encoderRef.current = null
    releaseResources()
    setState(INITIAL_STATE)
  }, [releaseResources])

  const cancel = useCallback(() => {
    cancelledRef.current = true
    encoderRef.current?.abort()
    encoderRef.current = null
    setState((s) => ({ ...s, phase: 'idle' }))
  }, [])

  // アンマウント時に録画停止・リソース解放
  useEffect(() => {
    return () => {
      cancelledRef.current = true
      encoderRef.current?.abort()
      releaseResources()
    }
  }, [releaseResources])

  const start = useCallback(async (input: VideoBuildInput) => {
    if (runningRef.current) return
    runningRef.current = true
    cancelledRef.current = false
    releaseResources()

    const {
      sceneToken, samples, channels, fps,
      maxImageSize = 640, calibSensorMap, egoPoses, location,
    } = input

    try {
      // ── prefetch フェーズ ─────────────────────────────────────────────────
      setState({ ...INITIAL_STATE, phase: 'prefetch' })

      const dataChannels = channels.filter((c) => c !== 'EGO_POSE')
      const hasRadar     = dataChannels.some((c) => c.startsWith('RADAR_'))
      // RADAR は点群の LIDAR_TOP 座標系変換と BBox 投影に LIDAR_TOP の brief が必要
      const fetchChannels = hasRadar && !dataChannels.includes('LIDAR_TOP')
        ? [...dataChannels, 'LIDAR_TOP']
        : dataChannels

      // シーン一括 sensor-data（フレームごとの API 呼び出しを 1 回に集約）
      const sceneSensorData = fetchChannels.length > 0
        ? await queryClient.fetchQuery(sceneSensorDataQueryOptions(sceneToken, fetchChannels))
        : []
      if (cancelledRef.current) return
      const briefsBySample = new Map<string, SensorDataMap>(
        sceneSensorData.map((e) => [e.sample_token, e.channels]),
      )

      // basemap（EGO_POSE または LiDAR/RADAR の下敷きに使用。通常はキャッシュ済み）
      const needsBasemap =
        channels.includes('EGO_POSE') ||
        dataChannels.some((c) => c === 'LIDAR_TOP' || c.startsWith('RADAR_'))
      let basemap: ImageBitmap | null = null
      if (needsBasemap && location) {
        basemap = await queryClient.fetchQuery(basemapQueryOptions(location)).catch(() => null)
      }
      if (cancelledRef.current) return

      // フレームデータ格納先
      const annotationsBySample = new Map<string, Annotation[]>()
      const imagesByToken       = new Map<string, ImageBitmap>()
      const pointCloudsByToken  = new Map<string, PointCloud>()

      // プリフェッチタスクを構築
      const tasks: (() => Promise<void>)[] = []
      let failed = 0
      const onSettled = () => setState((s) => ({ ...s, completed: s.completed + 1 }))

      for (const sample of samples) {
        tasks.push(async () => {
          try {
            const anns = await queryClient.fetchQuery(sampleAnnotationsQueryOptions(sample.token))
            annotationsBySample.set(sample.token, anns)
          } catch {
            failed++
          }
          onSettled()
        })

        const briefs = briefsBySample.get(sample.token) ?? {}
        for (const channel of dataChannels) {
          const brief = briefs[channel]
          if (!brief) continue

          if (channel.startsWith('CAM_')) {
            tasks.push(async () => {
              try {
                const bmp = await queryClient.fetchQuery(
                  videoSensorImageQueryOptions(brief.token, maxImageSize),
                )
                imagesByToken.set(brief.token, bmp)
                bitmapsRef.current.push(bmp)
              } catch {
                failed++
              }
              onSettled()
            })
          } else if (channel === 'LIDAR_TOP' || channel.startsWith('RADAR_')) {
            const isRadar = channel.startsWith('RADAR_')
            const refToken = isRadar
              ? briefs['LIDAR_TOP']?.calibrated_sensor_token ?? null
              : null
            tasks.push(async () => {
              try {
                const pc = await queryClient.fetchQuery(
                  pointCloudQueryOptions(brief.token, refToken),
                )
                pointCloudsByToken.set(brief.token, pc)
              } catch {
                failed++
              }
              onSettled()
            })
          }
        }
      }

      setState((s) => ({ ...s, total: tasks.length }))
      await runPool(tasks, 6, () => cancelledRef.current)
      if (cancelledRef.current) return

      if (tasks.length > 0 && failed > tasks.length * 0.25) {
        setState((s) => ({
          ...s, phase: 'error',
          error: `データ取得に失敗しました（${failed}/${tasks.length} 件）`,
        }))
        return
      }

      // ── recording フェーズ ────────────────────────────────────────────────
      const mimeType = pickSupportedWebmMimeType()
      if (!mimeType) {
        setState((s) => ({
          ...s, phase: 'error',
          error: 'このブラウザは WebM 録画（MediaRecorder）に対応していません',
        }))
        return
      }

      const canvas = canvasRef.current
      if (!canvas) {
        setState((s) => ({ ...s, phase: 'error', error: '録画用 Canvas が見つかりません' }))
        return
      }

      const layout = computeVideoLayout(channels)
      canvas.width  = layout.width
      canvas.height = layout.height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        setState((s) => ({ ...s, phase: 'error', error: 'Canvas 2D コンテキストを取得できません' }))
        return
      }

      const mfc: VideoFrameContext = { layout, calibSensorMap, egoPoses, basemap, location }

      const encoder = createMediaRecorderEncoder()
      encoderRef.current = encoder
      encoder.start(canvas, fps)
      setState((s) => ({ ...s, phase: 'recording', completed: 0, total: samples.length }))

      for (let i = 0; i < samples.length; i++) {
        if (cancelledRef.current) {
          encoder.abort()
          encoderRef.current = null
          return
        }
        const sample = samples[i]
        const briefs = briefsBySample.get(sample.token) ?? {}

        // サンプル基準 ego pose（LIDAR_TOP 優先、getSampleEgoPose と同じ規約）
        const frameEgoPose =
          briefs['LIDAR_TOP']?.ego_pose ??
          egoPoses.find((p) => p.sample_token === sample.token) ??
          null

        const channelData: Record<string, ChannelFrameData> = {}
        for (const channel of dataChannels) {
          const brief = briefs[channel] ?? null
          if (!brief) {
            channelData[channel] = { brief: null }
            continue
          }
          if (channel.startsWith('CAM_')) {
            channelData[channel] = {
              brief,
              image: imagesByToken.get(brief.token) ?? null,
            }
          } else {
            // LIDAR / RADAR。RADAR の BBox 投影は LIDAR_TOP の calib を使う（SensorCell と同じ）
            const calibToken = channel.startsWith('RADAR_')
              ? briefs['LIDAR_TOP']?.calibrated_sensor_token ?? brief.calibrated_sensor_token
              : brief.calibrated_sensor_token
            const calib = calibSensorMap[calibToken]
            channelData[channel] = {
              brief,
              pointCloud: pointCloudsByToken.get(brief.token) ?? null,
              bevCalib: calib
                ? { translation: calib.translation, rotation: calib.rotation }
                : null,
            }
          }
        }

        const frame: VideoFrameData = {
          sampleIndex: egoPoses.findIndex((p) => p.sample_token === sample.token),
          annotations: annotationsBySample.get(sample.token) ?? [],
          egoPose:     frameEgoPose,
          channels:    channelData,
        }

        drawVideoFrame(ctx, frame, mfc)
        await encoder.frameDrawn()
        setState((s) => ({ ...s, completed: i + 1 }))
      }

      // 最終フレームを 1 tick 保持してから停止（末尾フレームの取りこぼし防止）
      await encoder.frameDrawn()
      const blob = await encoder.stop()
      encoderRef.current = null

      if (cancelledRef.current) return
      const url = URL.createObjectURL(blob)
      videoUrlRef.current = url
      setState((s) => ({ ...s, phase: 'done', videoUrl: url, mimeType }))
    } catch (e) {
      encoderRef.current?.abort()
      encoderRef.current = null
      setState((s) => ({
        ...s, phase: 'error',
        error: e instanceof Error ? e.message : String(e),
      }))
    } finally {
      runningRef.current = false
    }
  }, [queryClient, canvasRef, releaseResources])

  return { state, start, cancel, reset }
}
