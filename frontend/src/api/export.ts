/**
 * nuScenes 形式エクスポートの ZIP をブラウザでダウンロードする.
 *
 * @param sceneToken null なら全シーン, 指定なら単一シーン
 * @returns warningCount: バックエンドで検出された整合性警告数 (WARNINGS.txt 内に詳細)
 */
export async function downloadNuscenesExport(
    sceneToken: string | null
): Promise<{ warningCount: number }> {
    const path = sceneToken !== null
        ? `/api/v1/export/nuscenes/${sceneToken}`
        : `/api/v1/export/nuscenes`

    const res = await fetch(path)
    if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Export failed: ${res.status} ${text}`)
    }

    // 警告数を取得 (整合性チェックでヒットした件数)
    const warningHeader = res.headers.get('X-Export-Warning-Count')
    const warningCount  = warningHeader ? parseInt(warningHeader, 10) : 0

    const blob     = await res.blob()
    const url      = URL.createObjectURL(blob)
    const filename = sceneToken !== null
        ? `nuscenes_export_${sceneToken}.zip`
        : 'nuscenes_export_all.zip'
    const a        = document.createElement('a')
    a.href         = url
    a.download     = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    return { warningCount }
}
