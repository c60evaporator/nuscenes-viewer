/**
 * Ego Pose 取得ユーティリティ
 */
import type { EgoPosePoint, SensorDataMap } from '@/types/sensor'

/**
 * サンプルの ego_pose を取得する.
 * devkit 準拠: LIDAR_TOP の ego_pose を優先し、取得できない場合は
 * sceneEgoPoses から sample_token が一致するものをフォールバックとして使う.
 */
export function getSampleEgoPose(
  sampleDataMap: SensorDataMap | undefined,
  sceneEgoPoses: EgoPosePoint[],
  sampleToken:   string | null,
): EgoPosePoint | undefined {
  const lidarEgoPose = sampleDataMap?.['LIDAR_TOP']?.ego_pose
  if (lidarEgoPose) {
    return {
      sample_token: sampleToken ?? '',
      timestamp:    0,
      translation:  lidarEgoPose.translation,
      rotation:     lidarEgoPose.rotation,
    }
  }
  return sampleToken
    ? sceneEgoPoses.find((p) => p.sample_token === sampleToken)
    : undefined
}
