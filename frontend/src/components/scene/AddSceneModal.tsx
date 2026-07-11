import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/api/client'
import { useImportScenes, type ImportFiles } from '@/api/sceneImport'
import { validateImportFolder, type PerFileResult } from '@/lib/sceneImportValidation'
import type { ImportErrorItem, SceneImportResult } from '@/types/sceneImport'

interface AddSceneModalProps {
  open:              boolean
  onClose:           () => void
  validLocations:    Set<string>
  validSensorTokens: Set<string>
  refReady:          boolean   // 参照データ（location/sensor）ロード完了フラグ
  onImported:        (result: SceneImportResult) => void
}

// テーブル名 → 内訳表示ラベル（順序も兼ねる）
const COUNT_ORDER: Array<[string, string]> = [
  ['scenes',            'scenes'],
  ['samples',           'samples'],
  ['sample_data',       'sample_data'],
  ['ego_pose',          'ego_pose'],
  ['log',               'log'],
  ['calibrated_sensor', 'calibrated_sensor'],
]

export default function AddSceneModal({
  open,
  onClose,
  validLocations,
  validSensorTokens,
  refReady,
  onImported,
}: AddSceneModalProps) {
  const importScenes = useImportScenes()

  const [validating, setValidating]   = useState(false)
  const [progress, setProgress]       = useState<string | null>(null)
  const [perFile, setPerFile]         = useState<PerFileResult[] | null>(null)
  const [validFiles, setValidFiles]   = useState<ImportFiles | null>(null)
  const [result, setResult]           = useState<SceneImportResult | null>(null)
  const [errorItems, setErrorItems]   = useState<ImportErrorItem[] | string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setValidating(false)
    setProgress(null)
    setPerFile(null)
    setValidFiles(null)
    setResult(null)
    setErrorItems(null)
    importScenes.reset()
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleClose = () => {
    const r = result
    reset()
    onClose()
    if (r) onImported(r)
  }

  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setPerFile(null)
    setValidFiles(null)
    setResult(null)
    setErrorItems(null)
    setValidating(true)
    try {
      const res = await validateImportFolder(files, {
        validLocations,
        validSensorTokens,
        onProgress: (label) => setProgress(label),
      })
      setPerFile(res.perFile)
      setValidFiles(res.files)
    } finally {
      setValidating(false)
      setProgress(null)
    }
  }

  const handleImport = async () => {
    if (!validFiles) return
    const ok = window.confirm('Add the scenes? This action cannot be undone.')
    if (!ok) return
    try {
      const r = await importScenes.mutateAsync(validFiles)
      setResult(r)
    } catch (err) {
      if (err instanceof ApiError) {
        // 422: detail が構造化エラー配列 or 文字列
        const detail = err.detail
        if (Array.isArray(detail)) {
          setErrorItems(detail as ImportErrorItem[])
        } else if (typeof detail === 'string') {
          setErrorItems(detail)
        } else if (detail && typeof detail === 'object' && 'errors' in detail) {
          setErrorItems((detail as SceneImportResult).errors)
        } else {
          setErrorItems(JSON.stringify(detail))
        }
      } else {
        setErrorItems(err instanceof Error ? err.message : 'Unknown error')
      }
    }
  }

  if (!open) return null

  const submitting = importScenes.isPending
  const canImport  = !!validFiles && !submitting && !result

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={submitting ? undefined : handleClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-[520px] max-w-[92vw] max-h-[86vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-800">Add Scene (Import from folder)</h2>
        </div>

        <div className="px-4 py-3 overflow-y-auto text-sm text-gray-700 flex-1">
          {/* ── 成功サマリ ── */}
          {result ? (
            <ImportSummary result={result} />
          ) : (
            <>
              {/* フォルダ選択 */}
              <p className="text-xs text-gray-500 mb-2">
                Please select a folder containing JSON files (scene / sample / sample_data / ego_pose / log / calibrated_sensor.json).
              </p>
              <div className="flex items-center gap-2 mb-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  disabled={submitting || !refReady}
                  onClick={() => inputRef.current?.click()}
                >
                  Select Folder
                </Button>
                <span className="text-xs text-gray-500">
                  {perFile ? `${perFile.length} files selected` : 'No folder selected'}
                </span>
              </div>
              <input
                ref={inputRef}
                type="file"
                multiple
                onChange={handleFolderSelect}
                disabled={submitting || !refReady}
                className="hidden"
                // webkitdirectory は React の型に無いため属性を明示注入
                {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
              />

              {!refReady && (
                <p className="text-xs text-gray-500 mb-2">Loading reference data…</p>
              )}

              {/* バリデーション進捗 */}
              {validating && (
                <p className="text-xs text-blue-600 mb-2">
                  Processing {progress ?? '...'}
                </p>
              )}

              {/* per-file 結果 */}
              {perFile && <PerFileList perFile={perFile} />}

              {/* インポートエラー */}
              {errorItems && <ImportErrors errors={errorItems} />}
            </>
          )}
        </div>

        <div className="px-4 py-3 border-t border-gray-200 flex justify-end gap-2">
          {result ? (
            <Button
              size="sm"
              className="text-white text-xs"
              style={{ backgroundColor: '#4A90D9' }}
              onClick={handleClose}
            >
              Close
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                disabled={submitting}
                onClick={handleClose}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="text-white text-xs"
                style={{
                  backgroundColor: canImport ? '#4A90D9' : '#9CA3AF',
                  cursor: canImport ? 'pointer' : 'not-allowed',
                }}
                disabled={!canImport}
                onClick={handleImport}
              >
                {submitting ? 'Importing...' : 'Import'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function PerFileList({ perFile }: { perFile: PerFileResult[] }) {
  return (
    <ul className="font-mono text-xs space-y-1">
      {perFile.map((p) => (
        <li key={p.name} className={p.ok ? 'text-gray-700' : 'text-red-600'}>
          {p.ok ? '✅' : '❌'} {p.label.padEnd(22, ' ')}
          {p.ok
            ? ` (${p.recordCount?.toLocaleString()} records)`
            : `  — ${p.error}`}
        </li>
      ))}
    </ul>
  )
}

function ImportSummary({ result }: { result: SceneImportResult }) {
  const names = result.added_scene_names
  const range =
    names.length === 0 ? '' :
    names.length === 1 ? names[0] :
    `${names[0]} – ${names[names.length - 1]}`
  return (
    <div className="font-mono text-xs">
      <p className="text-green-700 font-semibold mb-1">✅ Import complete</p>
      <p className="mb-2">
        Added scenes: {result.imported_counts['scenes'] ?? names.length}
        {range && <><br />{'  '}{range}</>}
      </p>
      <p className="text-gray-500 mb-1">Breakdown:</p>
      <ul className="space-y-0.5">
        {COUNT_ORDER.filter(([key]) => key in result.imported_counts).map(([key, label]) => (
          <li key={key}>
            {'  '}{label.padEnd(20, ' ')}{(result.imported_counts[key] ?? 0).toLocaleString()}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ImportErrors({ errors }: { errors: ImportErrorItem[] | string }) {
  if (typeof errors === 'string') {
    return <p className="text-red-600 text-xs mt-3 whitespace-pre-wrap">Import failed: {errors}</p>
  }
  return (
    <div className="mt-3">
      <p className="text-red-600 text-xs font-semibold mb-1">Import failed:</p>
      <ul className="text-red-600 text-xs font-mono space-y-1">
        {errors.map((e, i) => (
          <li key={i}>
            {e.file ? `[${e.file}] ` : ''}{e.token ? `${e.token}: ` : ''}{e.message}
          </li>
        ))}
      </ul>
    </div>
  )
}
