// scene 追加（Create）用のクライアント側バリデーション（純関数）
// AddScene.md「Create / フロントエンド」参照
//
// sample_data / ego_pose の token 相互参照は重いのでここでは検証せず backend 側で行う。
// ただし parse とレコード数取得は全ファイルで実施する。
import type { ImportFiles } from '../api/sceneImport'

// 期待する 6 ファイル（正準単数形。nuScenes データセット実物・Export 出力に一致）
export const EXPECTED_FILES = [
  'scene.json',
  'sample.json',
  'sample_data.json',
  'ego_pose.json',
  'log.json',
  'calibrated_sensor.json',
] as const

export type ExpectedFileName = typeof EXPECTED_FILES[number]

// 表示ラベル（AddScene.md の例に準拠。複数形表記）
export const FILE_DISPLAY_LABEL: Record<ExpectedFileName, string> = {
  'scene.json':             'scenes.json',
  'sample.json':            'samples.json',
  'sample_data.json':       'sample_data.json',
  'ego_pose.json':          'ego_pose.json',
  'log.json':               'log.json',
  'calibrated_sensor.json': 'calibrated_sensor.json',
}

export interface PerFileResult {
  name:        ExpectedFileName
  label:       string
  present:     boolean
  recordCount: number | null
  ok:          boolean
  error:       string | null
}

export interface ValidateResult {
  perFile: PerFileResult[]
  valid:   boolean
  files:   ImportFiles | null   // valid のときのみ 6 File を返す（送信用）
}

export interface ValidateOptions {
  validLocations:    Set<string>
  validSensorTokens: Set<string>
  onProgress?:       (label: string) => void
}

/** basename（パス末尾）を取り出す。webkitdirectory は relativePath 付きで来る */
function basename(f: File): string {
  const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
  const parts = rel.split('/')
  return parts[parts.length - 1]
}

/** 次の描画に 1 tick 譲る（重いファイルでも進捗表示が固まらないように） */
function yieldToPaint(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * 選択フォルダ内の File 群をバリデーションする。
 * 各ファイル処理の直前に onProgress(label) を呼び、await で 1 tick 譲ってから parse する。
 */
export async function validateImportFolder(
  fileList: FileList | File[],
  opts: ValidateOptions,
): Promise<ValidateResult> {
  const { validLocations, validSensorTokens, onProgress } = opts

  const files = Array.from(fileList)
  const byName = new Map<string, File>()
  for (const f of files) byName.set(basename(f), f)

  // パース結果を一時保持
  const parsed: Partial<Record<ExpectedFileName, unknown[]>> = {}
  const perFile: PerFileResult[] = []

  for (const name of EXPECTED_FILES) {
    const label = FILE_DISPLAY_LABEL[name]
    onProgress?.(label)
    await yieldToPaint()

    const file = byName.get(name)
    if (!file) {
      perFile.push({ name, label, present: false, recordCount: null, ok: false, error: '見つかりません' })
      continue
    }
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (!Array.isArray(data)) {
        perFile.push({ name, label, present: true, recordCount: null, ok: false, error: 'JSON配列ではありません' })
        continue
      }
      parsed[name] = data
      perFile.push({ name, label, present: true, recordCount: data.length, ok: true, error: null })
    } catch {
      perFile.push({ name, label, present: true, recordCount: null, ok: false, error: 'JSONパースに失敗' })
    }
  }

  // ここで parse に失敗したファイルがあれば、相互参照は行わず終了
  const parseOk = perFile.every((p) => p.ok)
  if (!parseOk) {
    return { perFile, valid: false, files: null }
  }

  const scenes            = parsed['scene.json']             as Array<{ token?: string }>
  const samples           = parsed['sample.json']            as Array<{ scene_token?: string }>
  const logs              = parsed['log.json']               as Array<{ location?: string }>
  const calibratedSensors = parsed['calibrated_sensor.json'] as Array<{ sensor_token?: string }>

  const sceneTokens = new Set(scenes.map((s) => s.token))

  // 軽量クロス参照（1件でも不一致ならそのファイルを ❌ にする）
  const markError = (name: ExpectedFileName, message: string) => {
    const pf = perFile.find((p) => p.name === name)
    if (pf) { pf.ok = false; pf.error = message }
  }

  // log.location ∈ validLocations
  const badLog = logs.find((l) => !l.location || !validLocations.has(l.location))
  if (badLog) markError('log.json', `未知の location: ${badLog.location ?? '(なし)'}`)

  // sample.scene_token ∈ scene.json tokens
  const badSample = samples.find((s) => !s.scene_token || !sceneTokens.has(s.scene_token))
  if (badSample) markError('sample.json', `scene_token が scene.json に存在しません: ${badSample.scene_token ?? '(なし)'}`)

  // calibrated_sensor.sensor_token ∈ DB sensors
  const badCs = calibratedSensors.find((c) => !c.sensor_token || !validSensorTokens.has(c.sensor_token))
  if (badCs) markError('calibrated_sensor.json', `未知の sensor_token: ${badCs.sensor_token ?? '(なし)'}`)

  const valid = perFile.every((p) => p.ok)

  const importFiles: ImportFiles | null = valid
    ? {
        scenes_file:            byName.get('scene.json')!,
        samples_file:           byName.get('sample.json')!,
        sample_data_file:       byName.get('sample_data.json')!,
        ego_pose_file:          byName.get('ego_pose.json')!,
        log_file:               byName.get('log.json')!,
        calibrated_sensor_file: byName.get('calibrated_sensor.json')!,
      }
    : null

  return { perFile, valid, files: importFiles }
}
