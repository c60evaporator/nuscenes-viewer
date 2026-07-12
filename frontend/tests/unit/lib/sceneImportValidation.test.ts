import { describe, it, expect } from 'vitest'
import { validateImportFolder, EXPECTED_FILES } from '@/lib/sceneImportValidation'

// name と text() だけ持つ軽量 File もどき（env 非依存）
function fakeFile(name: string, content: unknown): File {
  const text = typeof content === 'string' ? content : JSON.stringify(content)
  return { name, text: async () => text } as unknown as File
}

const VALID_LOCATIONS    = new Set(['boston-seaport'])
const VALID_SENSOR_TOKENS = new Set(['sensor-1'])

// 全 OK になる 6 ファイルのベースを生成
function goodFiles(): File[] {
  return [
    fakeFile('scene.json',             [{ token: 'sc-1' }]),
    fakeFile('sample.json',            [{ token: 'sa-1', scene_token: 'sc-1' }]),
    fakeFile('sample_data.json',       [{ token: 'sd-1', sample_token: 'sa-1' }]),
    fakeFile('ego_pose.json',          [{ token: 'ep-1' }]),
    fakeFile('log.json',               [{ token: 'lg-1', location: 'boston-seaport' }]),
    fakeFile('calibrated_sensor.json', [{ token: 'cs-1', sensor_token: 'sensor-1' }]),
  ]
}

const opts = { validLocations: VALID_LOCATIONS, validSensorTokens: VALID_SENSOR_TOKENS }

describe('validateImportFolder', () => {
  it('全ファイル揃い整合していれば valid=true でファイルを返す', async () => {
    const res = await validateImportFolder(goodFiles(), opts)
    expect(res.valid).toBe(true)
    expect(res.files).not.toBeNull()
    expect(res.perFile).toHaveLength(EXPECTED_FILES.length)
    expect(res.perFile.every((p) => p.ok)).toBe(true)
    // レコード数が取得できていること
    expect(res.perFile.find((p) => p.name === 'sample.json')?.recordCount).toBe(1)
  })

  it('ファイル欠落は present=false / valid=false', async () => {
    const files = goodFiles().filter((f) => f.name !== 'calibrated_sensor.json')
    const res = await validateImportFolder(files, opts)
    expect(res.valid).toBe(false)
    expect(res.files).toBeNull()
    const cs = res.perFile.find((p) => p.name === 'calibrated_sensor.json')!
    expect(cs.present).toBe(false)
    expect(cs.ok).toBe(false)
  })

  it('JSON パース失敗は ok=false', async () => {
    const files = goodFiles().filter((f) => f.name !== 'log.json')
    files.push(fakeFile('log.json', '{ this is not valid json'))
    const res = await validateImportFolder(files, opts)
    expect(res.valid).toBe(false)
    const lg = res.perFile.find((p) => p.name === 'log.json')!
    expect(lg.present).toBe(true)
    expect(lg.ok).toBe(false)
  })

  it('未知の location は log.json を ❌ にする', async () => {
    const files = goodFiles().filter((f) => f.name !== 'log.json')
    files.push(fakeFile('log.json', [{ token: 'lg-1', location: 'unknown-city' }]))
    const res = await validateImportFolder(files, opts)
    expect(res.valid).toBe(false)
    expect(res.perFile.find((p) => p.name === 'log.json')?.ok).toBe(false)
  })

  it('scene.json に無い scene_token は sample.json を ❌ にする', async () => {
    const files = goodFiles().filter((f) => f.name !== 'sample.json')
    files.push(fakeFile('sample.json', [{ token: 'sa-1', scene_token: 'MISSING' }]))
    const res = await validateImportFolder(files, opts)
    expect(res.valid).toBe(false)
    expect(res.perFile.find((p) => p.name === 'sample.json')?.ok).toBe(false)
  })

  it('未知の sensor_token は calibrated_sensor.json を ❌ にする', async () => {
    const files = goodFiles().filter((f) => f.name !== 'calibrated_sensor.json')
    files.push(fakeFile('calibrated_sensor.json', [{ token: 'cs-1', sensor_token: 'MISSING' }]))
    const res = await validateImportFolder(files, opts)
    expect(res.valid).toBe(false)
    expect(res.perFile.find((p) => p.name === 'calibrated_sensor.json')?.ok).toBe(false)
  })

  it('進捗コールバックが各ファイルで呼ばれる', async () => {
    const seen: string[] = []
    await validateImportFolder(goodFiles(), { ...opts, onProgress: (l) => seen.push(l) })
    expect(seen.length).toBe(EXPECTED_FILES.length)
  })
})
