/**
 * nuScenes 形式エクスポートの ZIP をブラウザでダウンロードする.
 *
 * @param sceneToken null なら全シーン、指定なら単一シーン
 */
export async function downloadNuscenesExport(sceneToken: string | null): Promise<void> {
    const path = sceneToken !== null
        ? `/api/v1/export/nuscenes/${sceneToken}`
        : `/api/v1/export/nuscenes`

    const res = await fetch(path)
    if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Export failed: ${res.status} ${text}`)
    }

    const blob        = await res.blob()
    const url         = URL.createObjectURL(blob)
    const filename    = sceneToken !== null
        ? `nuscenes_export_${sceneToken}.zip`
        : 'nuscenes_export_all.zip'
    const a           = document.createElement('a')
    a.href            = url
    a.download        = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}
