// カメラ画像ビューのパン・ズーム変換（CameraImageCanvas 用）
// contain フィットを基準に zoom / pan を適用したレイアウトを計算する純粋関数群

export const CAMERA_ZOOM = {
  MIN:          1,
  MAX:          10,
  WHEEL_FACTOR: 1.15,
} as const

export interface CameraViewLayout {
  displayW:   number
  displayH:   number
  offsetX:    number
  offsetY:    number
  scaleX:     number   // 画像px → 表示px（= fitScale * zoom）
  scaleY:     number
  containerW: number
  containerH: number
}

/**
 * パンをクランプする。
 * - 表示サイズがコンテナ以下の軸は pan=0（中央固定）
 * - 超える軸は offset ∈ [container − display, 0]（コンテナに隙間を作らない）
 */
export function clampCameraPan(
  pan:        { x: number; y: number },
  containerW: number,
  containerH: number,
  displayW:   number,
  displayH:   number,
): { x: number; y: number } {
  const maxPanX = Math.max(0, (displayW - containerW) / 2)
  const maxPanY = Math.max(0, (displayH - containerH) / 2)
  return {
    x: Math.min(maxPanX, Math.max(-maxPanX, pan.x)) + 0,  // + 0 で -0 を 0 に正規化
    y: Math.min(maxPanY, Math.max(-maxPanY, pan.y)) + 0,
  }
}

/** contain フィット + zoom + クランプ済み pan からレイアウトを計算する */
export function computeCameraViewLayout(
  containerW: number,
  containerH: number,
  naturalW:   number,
  naturalH:   number,
  zoom:       number,
  pan:        { x: number; y: number },
): CameraViewLayout {
  const fitScale = Math.min(containerW / naturalW, containerH / naturalH)
  const scale    = fitScale * zoom
  const displayW = naturalW * scale
  const displayH = naturalH * scale

  const clamped = clampCameraPan(pan, containerW, containerH, displayW, displayH)
  const offsetX = (containerW - displayW) / 2 + clamped.x
  const offsetY = (containerH - displayH) / 2 + clamped.y

  return { displayW, displayH, offsetX, offsetY, scaleX: scale, scaleY: scale, containerW, containerH }
}

/**
 * ホイールズームを適用する。カーソル直下の画像上の点がズーム後も
 * 同じ画面位置に留まるよう pan を逆算する（カーソルアンカー）。
 */
export function applyCameraWheelZoom(
  prev:       { zoom: number; pan: { x: number; y: number } },
  cursorX:    number,
  cursorY:    number,
  deltaY:     number,
  containerW: number,
  containerH: number,
  naturalW:   number,
  naturalH:   number,
): { zoom: number; pan: { x: number; y: number } } {
  const factor  = deltaY < 0 ? CAMERA_ZOOM.WHEEL_FACTOR : 1 / CAMERA_ZOOM.WHEEL_FACTOR
  const newZoom = Math.min(CAMERA_ZOOM.MAX, Math.max(CAMERA_ZOOM.MIN, prev.zoom * factor))
  if (newZoom === prev.zoom) return prev

  const before = computeCameraViewLayout(containerW, containerH, naturalW, naturalH, prev.zoom, prev.pan)

  // カーソル直下の画像座標（画像px）
  const imgX = (cursorX - before.offsetX) / before.scaleX
  const imgY = (cursorY - before.offsetY) / before.scaleY

  // ズーム後に同じ画面位置へ来る offset → pan を逆算
  const fitScale  = Math.min(containerW / naturalW, containerH / naturalH)
  const newScale  = fitScale * newZoom
  const displayW  = naturalW * newScale
  const displayH  = naturalH * newScale
  const newPan = {
    x: cursorX - imgX * newScale - (containerW - displayW) / 2,
    y: cursorY - imgY * newScale - (containerH - displayH) / 2,
  }

  return {
    zoom: newZoom,
    pan:  clampCameraPan(newPan, containerW, containerH, displayW, displayH),
  }
}
