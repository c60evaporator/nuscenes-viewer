/**
 * 座標変換ユーティリティ
 * nuScenes グローバル座標系（ENU）を基準とする
 * quaternion: [w, x, y, z] 形式
 */

// ── 内部ヘルパー ──────────────────────────────────────────────────────────────

/** クォータニオン [w, x, y, z] → 3×3 回転行列 */
function quatToRotMat(q: number[]): number[][] {
  const [w, x, y, z] = q
  return [
    [1 - 2*(y*y + z*z),  2*(x*y - z*w),    2*(x*z + y*w)],
    [2*(x*y + z*w),      1 - 2*(x*x + z*z), 2*(y*z - x*w)],
    [2*(x*z - y*w),      2*(y*z + x*w),    1 - 2*(x*x + y*y)],
  ]
}

/** 3×3 行列とベクトルの積 */
function matVecMul(m: number[][], v: number[]): number[] {
  return [
    m[0][0]*v[0] + m[0][1]*v[1] + m[0][2]*v[2],
    m[1][0]*v[0] + m[1][1]*v[1] + m[1][2]*v[2],
    m[2][0]*v[0] + m[2][1]*v[1] + m[2][2]*v[2],
  ]
}

/** ベクトルの差 */
function vecSub(a: number[], b: number[]): number[] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

// ── 公開 API ─────────────────────────────────────────────────────────────────

export const NUSCENES_MAP_META: Record<string, {
  canvasEdge: [number, number]
  resolution: number             // m/px（固定 0.1）
}> = {
  'boston-seaport':           { canvasEdge: [2979.5, 2118.1], resolution: 0.1 },
  'singapore-onenorth':       { canvasEdge: [1585.6, 2025.0], resolution: 0.1 },
  'singapore-hollandvillage': { canvasEdge: [2808.3, 2922.9], resolution: 0.1 },
  'singapore-queenstown':     { canvasEdge: [3228.6, 3687.1], resolution: 0.1 },
}

/**
 * グローバル3D座標をカメラの2Dピクセル座標に投影する（ピンホールカメラモデル）
 *
 * @param point          グローバル座標 [x, y, z]
 * @param intrinsic      カメラ内部パラメータ 3×3 行列
 * @param egoPose        自車位置 { translation: [x,y,z], rotation: [w,x,y,z] }
 * @param calibSensor    キャリブレーション済みセンサー { translation: [x,y,z], rotation: [w,x,y,z] }
 * @returns              ピクセル座標 [u, v]、カメラ前方でない場合は null
 */
export function project3DTo2D(
  point:       number[],
  intrinsic:   number[][],
  egoPose:     { translation: number[]; rotation: number[] },
  calibSensor: { translation: number[]; rotation: number[] },
): [number, number] | null {
  // グローバル → エゴ座標系
  const R_ego = quatToRotMat(egoPose.rotation)
  // 転置 = 逆回転
  const R_ego_T: number[][] = [
    [R_ego[0][0], R_ego[1][0], R_ego[2][0]],
    [R_ego[0][1], R_ego[1][1], R_ego[2][1]],
    [R_ego[0][2], R_ego[1][2], R_ego[2][2]],
  ]
  const p_ego = matVecMul(R_ego_T, vecSub(point, egoPose.translation))

  // エゴ → カメラ座標系
  const R_cs = quatToRotMat(calibSensor.rotation)
  const R_cs_T: number[][] = [
    [R_cs[0][0], R_cs[1][0], R_cs[2][0]],
    [R_cs[0][1], R_cs[1][1], R_cs[2][1]],
    [R_cs[0][2], R_cs[1][2], R_cs[2][2]],
  ]
  const p_cam = matVecMul(R_cs_T, vecSub(p_ego, calibSensor.translation))

  // カメラ前方（z > 0）でない場合は投影不可
  if (p_cam[2] <= 0) return null

  // 内部パラメータ適用: [fx*x/z + cx, fy*y/z + cy]
  const u = intrinsic[0][0] * (p_cam[0] / p_cam[2]) + intrinsic[0][2]
  const v = intrinsic[1][1] * (p_cam[1] / p_cam[2]) + intrinsic[1][2]

  return [u, v]
}

/**
 * グローバル座標（ENU）をマップ表示画像のピクセル座標に変換する
 *
 * @param translation  自車グローバル座標 [x, y, z]（z は無視）
 * @param location     マップロケーション名（'singapore-onenorth' 等）
 * @param displaySize  表示画像サイズ [width_px, height_px]
 * @returns            表示画像上のピクセル座標 [px, py]
 *
 * SDK の BitMap.render が extent=[0, canvasW, 0, canvasH] で画像全体を
 * メートル空間に引き伸ばして表示するため、元画像ピクセルサイズは不要。
 * NuScenes のマップ座標系は左下原点（ENU）のため Y 軸を反転する。
 */
export function egoPoseToPixel(
  translation: number[],
  location:    string,
  displaySize: [number, number],
): [number, number] {
  const meta = NUSCENES_MAP_META[location]
  if (!meta) return [0, 0]

  const [canvasW, canvasH] = meta.canvasEdge
  const [dispW, dispH]     = displaySize

  const px =  (translation[0] / canvasW) * dispW
  const py = (1 - translation[1] / canvasH) * dispH  // Y軸反転

  return [px, py]
}

/**
 * グローバルメートル座標 → マップ元画像ピクセル座標
 * devkit の MapMask.to_pixel_coords() と同じ変換
 *   px =  x / resolution
 *   py = -y / resolution + canvasH_px
 */
export function globalToMapPixel(
  x:        number,
  y:        number,
  location: string,
): [number, number] | null {
  const meta = NUSCENES_MAP_META[location]
  if (!meta) return null
  const { canvasEdge, resolution } = meta
  const canvasH_px = canvasEdge[1] / resolution
  return [
    x / resolution,
    -y / resolution + canvasH_px,
  ]
}

/**
 * BEV 表示範囲に対応する basemap の切り出し領域を計算する
 *
 * @param egoPose        自車グローバル座標 [x, y, z]
 * @param bevRangeMeters BEV 表示の半径（メートル）
 * @param location       マップロケーション名
 * @param bitmapSize     basemap 画像サイズ [width, height]
 * @returns              切り出し領域 {sx, sy, sw, sh}、ロケーション不明なら null
 */
export function calcBasemapCrop(
  egoPose:        number[],
  bevRangeMeters: number,
  location:       string,
  bitmapSize:     [number, number],
): { sx: number; sy: number; sw: number; sh: number } | null {
  const meta = NUSCENES_MAP_META[location]
  if (!meta) return null

  const [canvasW, canvasH] = meta.canvasEdge
  const [bmpW, bmpH]       = bitmapSize

  const [cx, cy] = egoPoseToPixel(egoPose, location, bitmapSize)

  const rangeX = bevRangeMeters * (bmpW / canvasW)
  const rangeY = bevRangeMeters * (bmpH / canvasH)

  return {
    sx: Math.round(cx - rangeX),
    sy: Math.round(cy - rangeY),
    sw: Math.round(rangeX * 2),
    sh: Math.round(rangeY * 2),
  }
}

/**
 * 3D バウンディングボックスの8頂点をグローバル座標で返す
 *
 * @param translation  BBox 中心のグローバル座標 [x, y, z]
 * @param rotation     BBox の向き [w, x, y, z]（クォータニオン）
 * @param size         [width, length, height]（nuScenes 定義）
 * @returns            8頂点のグローバル座標（各頂点は [x, y, z]）
 *
 * 頂点順（ローカル座標系）:
 *   0-3: 下面（z = -h/2）、4-7: 上面（z = +h/2）
 *   各面は [前右, 前左, 後左, 後右] の順（x=前方, y=左方向）
 */
export function bboxCornersToGlobal(
  translation: number[],
  rotation:    number[],
  size:        number[],
): number[][] {
  const [w, l, h] = size
  const hw = w / 2
  const hl = l / 2
  const hh = h / 2

  // ローカル座標での8頂点（nuScenes: x=前, y=左, z=上）
  const localCorners: number[][] = [
    [ hl,  hw, -hh],
    [ hl, -hw, -hh],
    [-hl, -hw, -hh],
    [-hl,  hw, -hh],
    [ hl,  hw,  hh],
    [ hl, -hw,  hh],
    [-hl, -hw,  hh],
    [-hl,  hw,  hh],
  ]

  const R = quatToRotMat(rotation)

  return localCorners.map((c) => {
    const rotated = matVecMul(R, c)
    return [
      rotated[0] + translation[0],
      rotated[1] + translation[1],
      rotated[2] + translation[2],
    ]
  })
}

/**
 * グローバル座標をセンサー座標系に変換する（BEV BBox 描画用）
 *
 * @param point       グローバル座標 [x, y, z]
 * @param egoPose     自車位置 { translation: [x,y,z], rotation: [w,x,y,z] }
 * @param calibSensor キャリブレーション済みセンサー { translation: [x,y,z], rotation: [w,x,y,z] }
 * @returns           センサー座標系での [x, y, z]
 */
export function globalToSensor(
  point:       number[],
  egoPose:     { translation: number[]; rotation: number[] },
  calibSensor: { translation: number[]; rotation: number[] },
): number[] {
  // グローバル → エゴ座標系
  const R_ego = quatToRotMat(egoPose.rotation)
  const R_ego_T: number[][] = [
    [R_ego[0][0], R_ego[1][0], R_ego[2][0]],
    [R_ego[0][1], R_ego[1][1], R_ego[2][1]],
    [R_ego[0][2], R_ego[1][2], R_ego[2][2]],
  ]
  const p_ego = matVecMul(R_ego_T, vecSub(point, egoPose.translation))

  // エゴ → センサー座標系
  const R_cs = quatToRotMat(calibSensor.rotation)
  const R_cs_T: number[][] = [
    [R_cs[0][0], R_cs[1][0], R_cs[2][0]],
    [R_cs[0][1], R_cs[1][1], R_cs[2][1]],
    [R_cs[0][2], R_cs[1][2], R_cs[2][2]],
  ]
  return matVecMul(R_cs_T, vecSub(p_ego, calibSensor.translation))
}
